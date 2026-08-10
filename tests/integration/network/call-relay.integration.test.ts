import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactStatuses: Record<string, { status: string; publicKey: string; address: string }> = {};

const { sendMock, scoreMock } = vi.hoisted(() => ({ sendMock: vi.fn(), scoreMock: vi.fn() }));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => 'me',
    getMyPublicKeyHex: () => '11'.repeat(32),
    getMyPublicKey: () => Buffer.from('11'.repeat(32), 'hex'),
    sign: () => Buffer.from('sig'),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: (upeerId: string) => contactStatuses[upeerId] ?? null,
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({ getVouchScore: scoreMock }));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({ sendSecureUDPMessage: sendMock }));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/call/validationCalls.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main_process/network/call/validationCalls.js')>();
    return { ...actual, validateCallPacket: () => ({ valid: true }) };
});

describe('call relay integración (SFU distribuido)', () => {
    let callManager: typeof import('../../../src/main_process/network/call/callManager.js')['callManager'];
    let signaling: typeof import('../../../src/main_process/network/call/callSignaling.js');
    let handleCallPacket: (upeerId: string, data: Record<string, unknown>, win: null) => void;

    beforeEach(async () => {
        callManager = (await import('../../../src/main_process/network/call/callManager.js')).callManager;
        signaling = await import('../../../src/main_process/network/call/callSignaling.js');
        ({ handleCallPacket } = await import('../../../src/main_process/network/call/callPacketHandler.js'));
        callManager.resetForTests();
        sendMock.mockClear();
        scoreMock.mockReset();
        scoreMock.mockResolvedValue(50);
        Object.keys(contactStatuses).forEach((key) => delete contactStatuses[key]);
        for (const id of ['me', 'p1', 'p2', 'p3', 'p4']) {
            contactStatuses[id] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::${id}` };
        }
    });

    it('si no soy el relay, el emisor envía su media solo al relay', async () => {
        scoreMock.mockImplementation(async (id) => (id === 'p2' ? 90 : 50));
        const session = callManager.createGroup(['p1', 'p2', 'p3', 'p4'], 'audio');
        const relay = await signaling.recomputeRelay(session.callId);
        expect(relay).toBe('p2');

        signaling.sendCallMedia('p1', session.callId, 'frame');
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith('200::p2', expect.objectContaining({ type: 'CALL_MEDIA' }), expect.anything());
    });

    it('el relay recibe la media de un miembro y la reenvía al resto', async () => {
        scoreMock.mockImplementation(async (id) => (id === 'me' ? 95 : 50));
        const session = callManager.createGroup(['p1', 'p2', 'p3', 'p4'], 'audio');
        const relay = await signaling.recomputeRelay(session.callId);
        expect(relay).toBe('me');

        handleCallPacket('p1', { type: 'CALL_MEDIA', callId: session.callId, data: 'frame', timestamp: Date.now() }, null);
        // Reenvía a p2, p3 y p4 (no al emisor p1 ni a mí).
        expect(sendMock).toHaveBeenCalledTimes(3);
        const targets = sendMock.mock.calls.map((c) => c[0]);
        expect(targets).toEqual(expect.arrayContaining(['200::p2', '200::p3', '200::p4']));
    });

    it('sin relay electo, el grupo hace fan-out a todos los miembros', async () => {
        const session = callManager.createGroup(['p1', 'p2', 'p3'], 'audio');
        signaling.sendCallMedia('p1', session.callId, 'frame');
        expect(sendMock).toHaveBeenCalledTimes(3);
    });
});
