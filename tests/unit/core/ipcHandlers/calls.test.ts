import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { registerCallHandlers } from '../../../../src/main_process/core/ipcHandlers/calls.js';
import { callManager } from '../../../../src/main_process/network/call/callManager.js';
import * as signaling from '../../../../src/main_process/network/call/callSignaling.js';
import * as messages from '../../../../src/main_process/storage/messages/operations.js';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }));

vi.mock('../../../../src/main_process/network/call/callSignaling.js', () => ({
    sendCallOffer: vi.fn(async () => 'call-123'),
    sendCallAccept: vi.fn(),
    sendCallReject: vi.fn(),
    sendCallEnd: vi.fn(),
    sendCallMediaUpdate: vi.fn(),
    sendCallMedia: vi.fn(),
    sendCallMeta: vi.fn(),
    sendCallMediaTo: vi.fn(),
    recomputeRelay: vi.fn(async () => 'peer1'),
    electRelay: vi.fn(async () => 'peer1'),
}));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../../src/main_process/storage/messages/operations.js', () => ({ saveMessage: vi.fn(async () => ({ changes: 1 })) }));
vi.mock('../../../../src/main_process/storage/contacts/operations.js', () => ({ getContactByUpeerId: vi.fn(() => ({ name: 'Peer' })) }));
vi.mock('../../../../src/main_process/network/messaging/chatSend.js', () => ({ sendUDPMessage: vi.fn(async () => undefined) }));

type Handler = (event: unknown, payload: Record<string, unknown>) => unknown;

function getHandler(channel: string): Handler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === channel);
    if (!call) {
        throw new Error(`Missing handler for ${channel}`);
    }
    return call[1] as Handler;
}

function getListener(channel: string): Handler {
    const call = vi.mocked(ipcMain.on).mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    if (!call) throw new Error(`Missing listener for ${channel}`);
    return call[1] as Handler;
}

describe('registerCallHandlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        callManager.resetForTests();
        registerCallHandlers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('start-call valida upeerId y kind', async () => {
        const handler = getHandler('start-call');
        expect((await handler(null, { upeerId: '', kind: 'audio' }) as { success: boolean }).success).toBe(false);
        expect((await handler(null, { upeerId: 'x', kind: 'data' }) as { success: boolean }).success).toBe(false);
    });

    it('timeout de ring sin respuesta notifica call-ended al renderer', async () => {
        vi.useFakeTimers();
        try {
            const sender = { send: vi.fn() };
            const handler = getHandler('get-all-calls');
            handler({ sender } as unknown as { sender: unknown }, {});
            const session = callManager.create('peer1', 'audio', 'outgoing');
            vi.advanceTimersByTime(31_000);
            expect(sender.send).toHaveBeenCalledWith('call-ended', expect.objectContaining({ callId: session.callId, reason: 'no-answer' }));
        } finally {
            vi.useRealTimers();
        }
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
        expect(session.phase).toBe('connected');
        expect(signaling.sendCallAccept).toHaveBeenCalledWith('peer1', session.callId);
    });

    it('end-call termina la llamada y envía el fin', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        const handler = getHandler('end-call');
        handler(null, { callId: session.callId });
        expect(session.phase).toBe('ended');
        expect(signaling.sendCallEnd).toHaveBeenCalledWith('peer1', session.callId);
    });

    it('persiste como mensaje una llamada conectada con su duración', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
        try {
            const sender = { send: vi.fn() };
            getHandler('get-all-calls')({ sender } as never, {});
            const session = callManager.create('peer1', 'video', 'outgoing');
            callManager.connect(session.callId);
            vi.setSystemTime(new Date('2026-10-15T12:00:05.000Z'));
            getHandler('end-call')(null, { callId: session.callId });

            await vi.waitFor(() => expect(messages.saveMessage).toHaveBeenCalledWith(
                expect.any(String), 'peer1', true, '__SYS__|Videollamada · 00:05 · 1792065600000', undefined, undefined, 'sent', expect.any(String), expect.any(Number),
            ));
            expect(sender.send).toHaveBeenCalledWith('receive-p2p-message', expect.objectContaining({
                upeerId: 'peer1', message: 'Videollamada · 00:05 · 1792065600000', isSystem: true,
            }));
        } finally {
            vi.useRealTimers();
        }
    });

    it('persiste y envía al historial una llamada saliente perdida', async () => {
        const sender = { send: vi.fn() };
        getHandler('get-all-calls')({ sender } as never, {});
        const session = callManager.create('peer1', 'audio', 'outgoing');
        callManager.end(session.callId, 'no-answer');

        await vi.waitFor(() => expect(messages.saveMessage).toHaveBeenCalledWith(
            expect.any(String), 'peer1', true, '__SYS__|Llamada de voz perdida', undefined, undefined, 'sent', expect.any(String), expect.any(Number),
        ));
        expect(sender.send).toHaveBeenCalledWith('receive-p2p-message', expect.objectContaining({
            upeerId: 'peer1', message: 'Llamada de voz perdida', isSystem: true,
        }));
        const chatSend = await import('../../../../src/main_process/network/messaging/chatSend.js');
        expect(chatSend.sendUDPMessage).toHaveBeenCalledWith('peer1', '__SYS__|Llamada de voz perdida', undefined, expect.any(String));
    });

    it('registra llamada de grupo saliente perdida como evento del grupo', async () => {
        const groups = await import('../../../../src/main_process/network/messaging/groups.js');
        const sendGroupCallEvent = vi.spyOn(groups, 'sendGroupCallEvent').mockResolvedValue();
        const session = callManager.createGroup(['peer1'], 'video', 'grp-call');
        callManager.end(session.callId, 'no-answer');

        expect(sendGroupCallEvent).toHaveBeenCalledWith(
            'grp-call', '__SYS__|Videollamada perdida', expect.any(Number), expect.any(String),
        );
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

    it('send-call-media unidireccional valida y reenvía el chunk sin esperar respuesta IPC', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        const handler = getListener('send-call-media');
        const mediaData = new Uint8Array([1, 2, 3]);
        const result = handler(null, { callId: session.callId, data: mediaData });
        expect(result).toBeUndefined();
        expect(signaling.sendCallMedia).toHaveBeenCalledWith('peer1', session.callId, mediaData);
    });

    it('send-call-media rechaza payload vacío', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        const handler = getListener('send-call-media');
        handler(null, { callId: session.callId, data: '' });
        expect(signaling.sendCallMedia).not.toHaveBeenCalled();
    });

    it('reenvía cambios del estado de compartir pantalla a los miembros de la llamada', () => {
        const session = callManager.createGroup(['peer1', 'peer2'], 'video');
        const listener = getListener('send-call-meta');

        listener(null, { callId: session.callId, meta: { type: 'screen-share', active: false } });

        expect(signaling.sendCallMeta).toHaveBeenCalledTimes(2);
        expect(signaling.sendCallMeta).toHaveBeenCalledWith('peer1', session.callId, { type: 'screen-share', active: false });
        expect(signaling.sendCallMeta).toHaveBeenCalledWith('peer2', session.callId, { type: 'screen-share', active: false });
    });

    it('ignora metadatos no admitidos para compartir pantalla', () => {
        const session = callManager.create('peer1', 'video', 'outgoing');
        const listener = getListener('send-call-meta');

        listener(null, { callId: session.callId, meta: { type: 'relay', active: false } });

        expect(signaling.sendCallMeta).not.toHaveBeenCalled();
    });

});
