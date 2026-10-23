import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerEnrollmentHandlers } from '../../../../src/main_process/core/ipcHandlers/enrollment.js';
import { createAuthorizerEnrollmentInvite, completeAuthorizerEnrollment } from '../../../../src/main_process/security/enrollmentAuthorizer.js';
import {
    beginEnrollment,
    buildSealedEnrollmentRequest,
    cancelEnrollment,
    finishEnrollment,
    getPendingEnrollmentOffer,
} from '../../../../src/main_process/security/enrollmentEnrollee.js';
import { RootIdentityUnavailableError } from '../../../../src/main_process/security/identityMode.js';
import { getDeviceIdentityStatus } from '../../../../src/main_process/security/deviceIdentity.js';
import { spawnYggstack } from '../../../../src/main_process/sidecars/yggstack.js';
import { startUDPServer } from '../../../../src/main_process/network/server/tcpServer.js';
import { decodeEnrollmentMessage, encodeEnrollmentMessage } from '../../../../src/main_process/security/enrollmentTransfer.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

const responseMessage = {
    inviteId: 'ab'.repeat(32),
    nonce: 'cd'.repeat(24),
    ciphertext: 'ef'.repeat(48),
};

function getRegisteredHandler(channel: string): Handler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    if (!call) throw new Error(`Missing handler for ${channel}`);
    return call[1] as Handler;
}

function invite(code = 'invite-code') {
    return {
        code,
        secret: Buffer.alloc(32),
        offer: {
            version: 1 as const,
            accountUpeerId: 'aa'.repeat(32),
            accountPublicKey: 'bb'.repeat(32),
            authorizerDeviceId: 'cc'.repeat(32),
            inviteId: 'dd'.repeat(32),
            expiresAt: 1_800_000_300_000,
        },
    };
}

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
}));

vi.mock('../../../../src/main_process/sidecars/yggstack.js', () => ({
    spawnYggstack: vi.fn(async () => undefined),
}));

vi.mock('../../../../src/main_process/network/server/tcpServer.js', () => ({
    startUDPServer: vi.fn(),
}));

vi.mock('../../../../src/main_process/core/windowManager.js', () => ({
    getMainWindow: vi.fn(() => null),
}));

vi.mock('../../../../src/main_process/network/dht/renewal.js', () => ({
    startRenewalService: vi.fn(),
}));

vi.mock('../../../../src/main_process/security/enrollmentAuthorizer.js', () => ({
    createAuthorizerEnrollmentInvite: vi.fn(),
    completeAuthorizerEnrollment: vi.fn(),
}));

vi.mock('../../../../src/main_process/security/enrollmentEnrollee.js', () => ({
    beginEnrollment: vi.fn(),
    buildSealedEnrollmentRequest: vi.fn(),
    cancelEnrollment: vi.fn(),
    finishEnrollment: vi.fn(),
    getPendingEnrollmentOffer: vi.fn(),
}));

vi.mock('../../../../src/main_process/security/enrollmentInvites.js', () => ({
    listEnrollmentInvites: vi.fn(() => []),
}));

vi.mock('../../../../src/main_process/security/deviceIdentity.js', () => ({
    getDeviceIdentityStatus: vi.fn(() => 'root'),
}));

vi.mock('../../../../src/main_process/security/identityMode.js', () => {
    class MockRootIdentityUnavailableError extends Error {}
    return { RootIdentityUnavailableError: MockRootIdentityUnavailableError };
});

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    warn: vi.fn(),
}));

describe('Enrollment IPC Handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerEnrollmentHandlers();
    });

    it('registra todos los canales de enrolamiento', () => {
        for (const channel of [
            'enrollment-create-invite',
            'enrollment-list-invites',
            'enrollment-complete',
            'enrollment-begin',
            'enrollment-finish',
            'enrollment-cancel',
            'enrollment-status',
        ]) {
            expect(ipcMain.handle).toHaveBeenCalledWith(channel, expect.any(Function));
        }
    });

    it('create-invite devuelve el código y la caducidad', () => {
        vi.mocked(createAuthorizerEnrollmentInvite).mockReturnValue(invite());
        const result = getRegisteredHandler('enrollment-create-invite')(null) as Record<string, unknown>;
        expect(result).toEqual({
            success: true,
            code: 'invite-code',
            inviteId: 'dd'.repeat(32),
            expiresAt: 1_800_000_300_000,
        });
    });

    it('create-invite explica la falta de raíz', () => {
        vi.mocked(createAuthorizerEnrollmentInvite).mockImplementation(() => {
            throw new RootIdentityUnavailableError('test');
        });
        const result = getRegisteredHandler('enrollment-create-invite')(null) as Record<string, unknown>;
        expect(result.success).toBe(false);
        expect(String(result.error)).toContain('raíz');
    });

    it('create-invite informa cuando no se pudo generar la invitación', () => {
        vi.mocked(createAuthorizerEnrollmentInvite).mockReturnValue(null);
        const result = getRegisteredHandler('enrollment-create-invite')(null) as Record<string, unknown>;
        expect(result.success).toBe(false);
    });

    it('complete rechaza un código inválido', () => {
        const result = getRegisteredHandler('enrollment-complete')(null, { code: 'no-base64!' }) as Record<string, unknown>;
        expect(result.success).toBe(false);
        expect(completeAuthorizerEnrollment).not.toHaveBeenCalled();
    });

    it('complete devuelve la respuesta sellada', () => {
        const requestCode = encodeEnrollmentMessage(responseMessage);
        vi.mocked(completeAuthorizerEnrollment).mockReturnValue({
            request: {} as never,
            certificate: { deviceId: 'dev-1', expiresAt: 1_900_000_000_000 } as never,
            response: responseMessage,
        });
        const result = getRegisteredHandler('enrollment-complete')(null, { code: requestCode }) as Record<string, unknown>;
        expect(result).toMatchObject({ success: true, deviceId: 'dev-1', expiresAt: 1_900_000_000_000 });
        expect(decodeEnrollmentMessage(result.code)).toEqual(responseMessage);
    });

    it('begin devuelve el código de solicitud', () => {
        vi.mocked(beginEnrollment).mockReturnValue(invite().offer);
        vi.mocked(buildSealedEnrollmentRequest).mockReturnValue(responseMessage);
        const result = getRegisteredHandler('enrollment-begin')(null, { code: 'invite-code' }) as Record<string, unknown>;
        expect(result).toMatchObject({ success: true, accountUpeerId: 'aa'.repeat(32) });
        expect(decodeEnrollmentMessage(result.requestCode)).toEqual(responseMessage);
    });

    it('begin informa cuando la invitación no es válida', () => {
        vi.mocked(beginEnrollment).mockReturnValue(null);
        const result = getRegisteredHandler('enrollment-begin')(null, { code: 'invite-code' }) as Record<string, unknown>;
        expect(result.success).toBe(false);
    });

    it('finish instala el certificado e inicia la red', async () => {
        vi.mocked(finishEnrollment).mockReturnValue({
            deviceId: 'dev-1',
            accountUpeerId: 'aa'.repeat(32),
            expiresAt: 1_900_000_000_000,
        } as never);
        const result = await getRegisteredHandler('enrollment-finish')(null, { code: encodeEnrollmentMessage(responseMessage) }) as Record<string, unknown>;
        expect(result).toMatchObject({ success: true, deviceId: 'dev-1', upeerId: 'aa'.repeat(32) });
        expect(spawnYggstack).toHaveBeenCalled();
    });

    it('finish rechaza un certificado no verificable', async () => {
        vi.mocked(finishEnrollment).mockReturnValue(null);
        const result = await getRegisteredHandler('enrollment-finish')(null, { code: encodeEnrollmentMessage(responseMessage) }) as Record<string, unknown>;
        expect(result.success).toBe(false);
        expect(spawnYggstack).not.toHaveBeenCalled();
        expect(startUDPServer).not.toHaveBeenCalled();
    });

    it('cancel cancela el enrolamiento en curso', () => {
        getRegisteredHandler('enrollment-cancel')(null);
        expect(cancelEnrollment).toHaveBeenCalled();
    });

    it('status informa del enrolamiento pendiente y del estado del dispositivo', () => {
        vi.mocked(getPendingEnrollmentOffer).mockReturnValue(invite().offer);
        vi.mocked(getDeviceIdentityStatus).mockReturnValue('locked');
        const result = getRegisteredHandler('enrollment-status')(null) as Record<string, unknown>;
        expect(result).toMatchObject({ pending: true, accountUpeerId: 'aa'.repeat(32), deviceStatus: 'locked' });
    });

    it('status informa cuando no hay enrolamiento pendiente', () => {
        vi.mocked(getPendingEnrollmentOffer).mockReturnValue(null);
        vi.mocked(getDeviceIdentityStatus).mockReturnValue('root');
        const result = getRegisteredHandler('enrollment-status')(null) as Record<string, unknown>;
        expect(result).toMatchObject({ pending: false, deviceStatus: 'root' });
    });
});
