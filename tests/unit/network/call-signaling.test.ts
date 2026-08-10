import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCallMediaUpdate, sendCallEnd, sendCallMedia, electRelay, recomputeRelay } from '../../../src/main_process/network/call/callSignaling.js';
import { callManager } from '../../../src/main_process/network/call/callManager.js';

const { sendMock, scoreMock } = vi.hoisted(() => ({ sendMock: vi.fn(), scoreMock: vi.fn() }));

vi.mock('../../../src/main_process/security/identity.js', () => ({ getMyUPeerId: () => 'me' }));
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: () => ({ address: '1::1', publicKey: undefined }),
}));
vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({ getVouchScore: scoreMock }));
vi.mock('../../../src/main_process/network/server/transport.js', () => ({ sendSecureUDPMessage: sendMock }));
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));

describe('callSignaling (grupos)', () => {
    beforeEach(() => {
        callManager.resetForTests();
        sendMock.mockClear();
        scoreMock.mockReset();
        scoreMock.mockResolvedValue(50);
    });

    it('sendCallMediaUpdate en 1:1 envía solo al peer', () => {
        const session = callManager.create('peer9', 'audio', 'outgoing');
        sendCallMediaUpdate('peer9', session.callId, { muted: true, cameraEnabled: true });
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith('1::1', expect.objectContaining({ type: 'CALL_MEDIA_UPDATE', muted: true }), undefined);
    });

    it('sendCallMediaUpdate hace broadcast a todos los miembros del grupo', () => {
        const session = callManager.createGroup(['peer1', 'peer2', 'peer3'], 'audio');
        sendCallMediaUpdate('peer1', session.callId, { muted: true, cameraEnabled: true });
        expect(sendMock).toHaveBeenCalledTimes(3);
        const packets = sendMock.mock.calls.map((c) => c[1] as { type: string; muted?: boolean });
        expect(packets.every((p) => p.type === 'CALL_MEDIA_UPDATE' && p.muted === true)).toBe(true);
    });

    it('sendCallEnd en grupo notifica a todos los miembros', () => {
        const session = callManager.createGroup(['peer1', 'peer2'], 'audio');
        sendCallEnd('peer1', session.callId);
        expect(sendMock).toHaveBeenCalledTimes(2);
        const packets = sendMock.mock.calls.map((c) => c[1] as { type: string });
        expect(packets.every((p) => p.type === 'CALL_END')).toBe(true);
    });

    it('sendCallEnd en 1:1 envía solo al peer', () => {
        const session = callManager.create('peer9', 'audio', 'outgoing');
        sendCallEnd('peer9', session.callId);
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith('1::1', expect.objectContaining({ type: 'CALL_END' }), undefined);
    });

    it('electRelay elige por reputación y desempata por upeerId', async () => {
        scoreMock.mockImplementation(async (id) => (id === 'high' ? 90 : 50));
        expect(await electRelay(['a', 'high', 'b'])).toBe('high');
        scoreMock.mockResolvedValue(50);
        expect(await electRelay(['zz', 'aa'])).toBe('aa');
    });

    it('recomputeRelay fija el relay en la sesión (grupo grande)', async () => {
        const session = callManager.createGroup(['p1', 'p2', 'p3', 'p4', 'p5'], 'audio');
        scoreMock.mockImplementation(async (id) => (id === 'p1' ? 80 : 50));
        const relay = await recomputeRelay(session.callId);
        expect(relay).toBe('p1');
        expect(callManager.getRelayUpeer(session.callId)).toBe('p1');
    });

    it('recomputeRelay no activa relay en grupos pequeños (mesh)', async () => {
        const session = callManager.createGroup(['p1', 'p2'], 'audio');
        const relay = await recomputeRelay(session.callId);
        expect(relay).toBeUndefined();
        expect(callManager.getRelayUpeer(session.callId)).toBeUndefined();
    });

    it('sendCallMedia sin relay hace fan-out a todos los miembros', () => {
        const session = callManager.createGroup(['p1', 'p2'], 'audio');
        sendCallMedia('p1', session.callId, 'data');
        expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('sendCallMedia con relay envía solo al relay si no soy el relay', () => {
        const session = callManager.createGroup(['p1', 'p2'], 'audio');
        callManager.setRelayUpeer(session.callId, 'p1');
        sendCallMedia('p1', session.callId, 'data');
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith('1::1', expect.objectContaining({ type: 'CALL_MEDIA' }), undefined);
    });

    it('sendCallMedia con relay hace fan-out si soy el relay', () => {
        const session = callManager.createGroup(['p1', 'p2'], 'audio');
        callManager.setRelayUpeer(session.callId, 'me');
        sendCallMedia('p1', session.callId, 'data');
        expect(sendMock).toHaveBeenCalledTimes(2);
    });
});
