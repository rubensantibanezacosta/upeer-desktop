import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { registerCallHandlers } from '../../../../src/main_process/core/ipcHandlers/calls.js';
import { callManager } from '../../../../src/main_process/network/call/callManager.js';
import * as signaling from '../../../../src/main_process/network/call/callSignaling.js';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

vi.mock('../../../../src/main_process/network/call/callSignaling.js', () => ({
    sendCallOffer: vi.fn(async () => 'call-123'),
    sendCallAccept: vi.fn(),
    sendCallReject: vi.fn(),
    sendCallEnd: vi.fn(),
    sendCallMediaUpdate: vi.fn(),
    sendCallMedia: vi.fn(),
}));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));

type Handler = (event: unknown, payload: Record<string, unknown>) => unknown;

function getHandler(channel: string): Handler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === channel);
    if (!call) {
        throw new Error(`Missing handler for ${channel}`);
    }
    return call[1] as Handler;
}

describe('registerCallHandlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        callManager.resetForTests();
        registerCallHandlers();
    });

    it('start-call valida upeerId y kind', async () => {
        const handler = getHandler('start-call');
        expect((await handler(null, { upeerId: '', kind: 'audio' }) as { success: boolean }).success).toBe(false);
        expect((await handler(null, { upeerId: 'x', kind: 'data' }) as { success: boolean }).success).toBe(false);
    });

    it('start-call crea la llamada y devuelve el callId', async () => {
        const handler = getHandler('start-call');
        const result = await handler(null, { upeerId: 'peer1', kind: 'video' }) as { success: boolean; callId: string };
        expect(result.success).toBe(true);
        expect(result.callId).toBe('call-123');
        expect(signaling.sendCallOffer).toHaveBeenCalledWith('peer1', 'video');
    });

    it('accept-call acepta la llamada y envía el accept', async () => {
        const session = callManager.create('peer1', 'audio', 'incoming');
        const handler = getHandler('accept-call');
        const result = await handler(null, { callId: session.callId }) as { success: boolean };
        expect(result.success).toBe(true);
        expect(session.phase).toBe('negotiating');
        expect(signaling.sendCallAccept).toHaveBeenCalledWith('peer1', session.callId);
    });

    it('end-call termina la llamada y envía el fin', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        const handler = getHandler('end-call');
        handler(null, { callId: session.callId });
        expect(session.phase).toBe('ended');
        expect(signaling.sendCallEnd).toHaveBeenCalledWith('peer1', session.callId);
    });

    it('reject-call termina con razón rejected y envía el rechazo', () => {
        const session = callManager.create('peer1', 'audio', 'incoming');
        const handler = getHandler('reject-call');
        handler(null, { callId: session.callId });
        expect(session.phase).toBe('ended');
        expect(session.endReason).toBe('rejected');
        expect(signaling.sendCallReject).toHaveBeenCalledWith('peer1', session.callId);
    });

    it('call-toggle-media alterna mute y envía la actualización', () => {
        const session = callManager.create('peer1', 'video', 'outgoing');
        const handler = getHandler('call-toggle-media');
        handler(null, { callId: session.callId, type: 'mute' });
        expect(session.muted).toBe(true);
        expect(signaling.sendCallMediaUpdate).toHaveBeenCalledWith('peer1', session.callId, { muted: true, cameraEnabled: true });
    });

    it('call-params devuelve los codecs según el tipo', () => {
        const session = callManager.create('peer1', 'video', 'outgoing');
        const handler = getHandler('call-params');
        const result = handler(null, { callId: session.callId }) as { success: boolean; kind: string; codecs: string[] };
        expect(result.success).toBe(true);
        expect(result.kind).toBe('video');
        expect(result.codecs).toContain('vp8');
    });

    it('send-call-media valida y reenvía el chunk por el canal', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        const handler = getHandler('send-call-media');
        const result = handler(null, { callId: session.callId, data: 'frame-1' }) as { success: boolean };
        expect(result.success).toBe(true);
        expect(signaling.sendCallMedia).toHaveBeenCalledWith('peer1', session.callId, 'frame-1');
    });

    it('send-call-media rechaza payload vacío', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        const handler = getHandler('send-call-media');
        const result = handler(null, { callId: session.callId, data: '' }) as { success: boolean };
        expect(result.success).toBe(false);
    });
});
