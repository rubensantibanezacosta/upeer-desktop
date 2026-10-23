import { ipcMain } from 'electron';
import { spawnYggstack } from '../../sidecars/yggstack.js';
import { startUDPServer } from '../../network/server/tcpServer.js';
import { getMainWindow } from '../windowManager.js';
import { completeAuthorizerEnrollment, createAuthorizerEnrollmentInvite } from '../../security/enrollmentAuthorizer.js';
import {
    beginEnrollment,
    buildSealedEnrollmentRequest,
    cancelEnrollment,
    finishEnrollment,
    getPendingEnrollmentOffer,
} from '../../security/enrollmentEnrollee.js';
import { listEnrollmentInvites } from '../../security/enrollmentInvites.js';
import { decodeEnrollmentMessage, encodeEnrollmentMessage } from '../../security/enrollmentTransfer.js';
import { getDeviceIdentityStatus } from '../../security/deviceIdentity.js';
import { RootIdentityUnavailableError } from '../../security/identityMode.js';
import { debug, warn } from '../../security/secure-logger.js';

function describeEnrollmentError(err: unknown): string {
    if (err instanceof RootIdentityUnavailableError) {
        return 'Este dispositivo no tiene la raíz de la cuenta; inicia el enrolamiento desde otro dispositivo autorizado.';
    }
    if (err instanceof Error && err.message === 'Identity is locked') {
        return 'La sesión está bloqueada; desbloquéala antes de enrolar dispositivos.';
    }
    const detail = err instanceof Error ? err.message : String(err);
    warn('Fallo en el enrolamiento de dispositivos', { error: detail }, 'identity');
    return 'No se pudo completar la operación de enrolamiento.';
}

function readCode(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const code = (payload as Record<string, unknown>).code;
    return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null;
}

async function startEnrolledDevice(): Promise<void> {
    await spawnYggstack();
    const mainWindow = getMainWindow();
    if (mainWindow) startUDPServer(mainWindow);
    const { startRenewalService } = await import('../../network/dht/renewal.js');
    startRenewalService();
}

export function registerEnrollmentHandlers(): void {
    ipcMain.handle('enrollment-create-invite', () => {
        try {
            const invite = createAuthorizerEnrollmentInvite();
            if (!invite) return { success: false, error: 'No se pudo crear la invitación de enrolamiento.' };
            debug('Invitación de enrolamiento creada', { inviteId: invite.offer.inviteId }, 'identity');
            return {
                success: true,
                code: invite.code,
                inviteId: invite.offer.inviteId,
                expiresAt: invite.offer.expiresAt,
            };
        } catch (err) {
            return { success: false, error: describeEnrollmentError(err) };
        }
    });

    ipcMain.handle('enrollment-list-invites', () => ({
        invites: listEnrollmentInvites().map(offer => ({
            inviteId: offer.inviteId,
            authorizerDeviceId: offer.authorizerDeviceId,
            expiresAt: offer.expiresAt,
        })),
    }));

    ipcMain.handle('enrollment-complete', (_event, payload: unknown) => {
        try {
            const code = readCode(payload);
            if (!code) return { success: false, error: 'Falta el código de solicitud del dispositivo.' };
            const sealed = decodeEnrollmentMessage(code);
            if (!sealed) return { success: false, error: 'El código de solicitud no es válido.' };
            const issued = completeAuthorizerEnrollment(sealed);
            if (!issued) return { success: false, error: 'La solicitud no se pudo autorizar.' };
            return {
                success: true,
                code: encodeEnrollmentMessage(issued.response),
                deviceId: issued.certificate.deviceId,
                expiresAt: issued.certificate.expiresAt,
            };
        } catch (err) {
            return { success: false, error: describeEnrollmentError(err) };
        }
    });

    ipcMain.handle('enrollment-begin', (_event, payload: unknown) => {
        const code = readCode(payload);
        if (!code) return { success: false, error: 'Falta el código de invitación.' };
        const offer = beginEnrollment(code);
        if (!offer) return { success: false, error: 'La invitación no es válida o ha caducado.' };
        const sealed = buildSealedEnrollmentRequest();
        if (!sealed) return { success: false, error: 'No se pudo preparar la solicitud de enrolamiento.' };
        return {
            success: true,
            requestCode: encodeEnrollmentMessage(sealed),
            accountUpeerId: offer.accountUpeerId,
            expiresAt: offer.expiresAt,
        };
    });

    ipcMain.handle('enrollment-finish', async (_event, payload: unknown) => {
        const code = readCode(payload);
        if (!code) return { success: false, error: 'Falta el código de respuesta del dispositivo autorizador.' };
        const sealed = decodeEnrollmentMessage(code);
        if (!sealed) return { success: false, error: 'El código de respuesta no es válido.' };
        const certificate = finishEnrollment(sealed);
        if (!certificate) return { success: false, error: 'El certificado de enrolamiento no es válido.' };
        try {
            await startEnrolledDevice();
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            warn('El dispositivo enrolado no pudo iniciar la red', { error: detail }, 'identity');
        }
        return {
            success: true,
            deviceId: certificate.deviceId,
            upeerId: certificate.accountUpeerId,
            expiresAt: certificate.expiresAt,
        };
    });

    ipcMain.handle('enrollment-cancel', () => {
        cancelEnrollment();
        return { success: true };
    });

    ipcMain.handle('enrollment-status', () => {
        const pending = getPendingEnrollmentOffer();
        const base = { deviceStatus: getDeviceIdentityStatus() };
        if (!pending) return { pending: false, ...base };
        return { pending: true, accountUpeerId: pending.accountUpeerId, expiresAt: pending.expiresAt, ...base };
    });
}
