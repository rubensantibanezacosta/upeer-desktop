import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactStatuses: Record<string, { status: string; publicKey: string; address: string }> = {};

const { sendMock, scoreMock, sendToMainWindow } = vi.hoisted(() => ({ sendMock: vi.fn(), scoreMock: vi.fn(), sendToMainWindow: vi.fn() }));

vi.mock('../../../src/main_process/core/windowManager.js', () => ({
    getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: sendToMainWindow },
    }),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => 'me',
    getMyPublicKeyHex: () => '11'.repeat(32),
    getMyPublicKey: () => Buffer.from('11'.repeat(32), 'hex'),
    sign: () => Buffer.from('sig'),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: (upeerId: string) => contactStatuses[upeerId] ?? null,
    isContactBlocked: () => false,
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({ getVouchScore: scoreMock }));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({ sendSecurePacket: sendMock }));

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
    let handleCallPacket: typeof import('../../../src/main_process/network/call/callPacketHandler.js')['handleCallPacket'];

    beforeEach(async () => {
        callManager = (await import('../../../src/main_process/network/call/callManager.js')).callManager;
        signaling = await import('../../../src/main_process/network/call/callSignaling.js');
        ({ handleCallPacket } = await import('../../../src/main_process/network/call/callPacketHandler.js'));
        callManager.resetForTests();
        sendMock.mockClear();
        sendToMainWindow.mockClear();
        scoreMock.mockReset();
        scoreMock.mockResolvedValue(50);
        Object.keys(contactStatuses).forEach((key) => delete contactStatuses[key]);
        for (const id of ['me', 'p1', 'p2', 'p3', 'p4']) {
            contactStatuses[id] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::${id}` };
        }
    });

    it('notifica al emisor cuando llega CALL_ACCEPT aunque el router no pase una ventana', () => {
        const session = callManager.create('p1', 'audio', 'outgoing');

        handleCallPacket('p1', { type: 'CALL_ACCEPT', callId: session.callId }, null);

        expect(sendToMainWindow).toHaveBeenCalledWith('call-accepted', expect.objectContaining({
            callId: session.callId,
            peerUpeerId: 'p1',
        }));
    });

    it('si no soy el relay, el emisor envía su media solo al relay', async () => {
        scoreMock.mockImplementation(async (id) => (id === 'p2' ? 90 : 50));
        const session = callManager.createGroup(['p1', 'p2', 'p3', 'p4'], 'audio');
        const relay = await signaling.recomputeRelay(session.callId);
        expect(relay).toBe('p2');

        signaling.sendCallMedia('p1', session.callId, new Uint8Array([1]));
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith('200::p2', expect.objectContaining({ type: 'CALL_MEDIA' }), expect.anything());
    });

    it('el relay recibe la media de un miembro y la reenvía al resto', async () => {
        scoreMock.mockImplementation(async (id) => (id === 'me' ? 95 : 50));
        const session = callManager.createGroup(['p1', 'p2', 'p3', 'p4'], 'audio');
        const relay = await signaling.recomputeRelay(session.callId);
        expect(relay).toBe('me');

        handleCallPacket('p1', { type: 'CALL_MEDIA', callId: session.callId, data: new Uint8Array([1]), timestamp: Date.now() }, null);
        // Reenvía a p2, p3 y p4 (no al emisor p1 ni a mí).
        expect(sendMock).toHaveBeenCalledTimes(3);
        const targets = sendMock.mock.calls.map((c) => c[0]);
        expect(targets).toEqual(expect.arrayContaining(['200::p2', '200::p3', '200::p4']));
        const relayedPackets = sendMock.mock.calls.map((call) => call[1] as { senderUpeerId?: string });
        expect(relayedPackets.every((packet) => packet.senderUpeerId === 'p1')).toBe(true);
    });

    it('el relay conserva audio y limita a keyframes el vídeo de quienes no son hablantes activos', async () => {
        scoreMock.mockImplementation(async (id) => (id === 'me' ? 95 : 50));
        const session = callManager.createGroup(['p1', 'p2', 'p3', 'p4'], 'video');
        await signaling.recomputeRelay(session.callId);
        const data = new Uint8Array(17);
        data[0] = 1;
        data[16] = 1;

        handleCallPacket('p1', { type: 'CALL_META', callId: session.callId, meta: { type: 'speaker', active: true } }, null);
        handleCallPacket('p2', { type: 'CALL_MEDIA', callId: session.callId, data, timestamp: Date.now() }, null);
        expect(sendMock).toHaveBeenCalledTimes(3);
        sendMock.mockClear();
        handleCallPacket('p2', { type: 'CALL_MEDIA', callId: session.callId, data, timestamp: Date.now() }, null);
        expect(sendMock).not.toHaveBeenCalled();

        const audio = new Uint8Array(17);
        audio[0] = 0;
        audio[16] = 1;
        handleCallPacket('p2', { type: 'CALL_MEDIA', callId: session.callId, data: audio, timestamp: Date.now() }, null);
        expect(sendMock).toHaveBeenCalledTimes(3);
    });

    it('no reenvía media entrante a participantes cuando la llamada ya terminó', () => {
        const session = callManager.createGroup(['p1', 'p2', 'p3'], 'audio');
        callManager.end(session.callId);
        const sendToRenderer = vi.fn();

        handleCallPacket('p1', { type: 'CALL_MEDIA', callId: session.callId, data: new Uint8Array([1]), timestamp: Date.now() }, {
            webContents: { send: sendToRenderer },
        } as unknown as Parameters<typeof handleCallPacket>[2]);

        expect(sendToRenderer).toHaveBeenCalledWith('call-media', expect.objectContaining({ callId: session.callId }));
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('sin relay electo, el grupo hace fan-out a todos los miembros', async () => {
        const session = callManager.createGroup(['p1', 'p2', 'p3'], 'audio');
        signaling.sendCallMedia('p1', session.callId, new Uint8Array([1]));
        expect(sendMock).toHaveBeenCalledTimes(3);
    });
});
