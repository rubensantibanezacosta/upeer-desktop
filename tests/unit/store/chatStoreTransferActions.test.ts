import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createChatTransferActions } from '../../../src/store/chatStoreTransferActions.ts';

const sendMessage = vi.fn();
type UpeerWin = { upeer: { sendMessage: typeof sendMessage } };
(window as unknown as UpeerWin).upeer = { sendMessage };

describe('chatStoreTransferActions', () => {
    let state: Record<string, unknown>;
    let actions: ReturnType<typeof createChatTransferActions>;

    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            untrustworthyAlert: { msg: 'x' },
            keyChangeAlerts: { p1: true },
            pendingFiles: [],
            isDragging: false,
            chatHistory: [],
            groupChatHistory: [],
            targetUpeerId: 'peer-1',
            replyByConversation: {},
            activeGroupId: null,
            myIdentity: { upeerId: 'me', name: 'Yo' },
        };
        const set = vi.fn((fn: unknown) => {
            const next = typeof fn === 'function' ? fn(state) : fn;
            Object.assign(state, next);
        });
        const get = vi.fn(() => state);
        actions = createChatTransferActions(set as never, get as never);
    });

    it('clearUntrustworthyAlert y clearKeyChangeAlert limpian alertas', () => {
        actions.clearUntrustworthyAlert();
        expect(state.untrustworthyAlert).toBeNull();

        actions.clearKeyChangeAlert('p1');
        expect(state.keyChangeAlerts).toEqual({});

        state.keyChangeAlerts = { p1: true, p2: true };
        actions.clearKeyChangeAlert();
        expect(state.keyChangeAlerts).toEqual({});
    });

    it('setPendingFiles y setIsDragging actualizan estado', () => {
        actions.setPendingFiles([{ path: '/a' } as never]);
        expect(state.pendingFiles).toHaveLength(1);
        actions.setIsDragging(true);
        expect(state.isDragging).toBe(true);
    });

    it('handleRetryMessage reenvía el mensaje y actualiza su estado', async () => {
        state.chatHistory = [{ id: 'm1', isMine: true, message: 'hola', replyTo: null, status: 'failed' }];
        sendMessage.mockResolvedValue({ timestamp: 5000 });
        await actions.handleRetryMessage('m1');
        expect(sendMessage).toHaveBeenCalledWith('peer-1', 'hola', null, undefined, 'm1');
        expect((state.chatHistory as { status: string }[])[0].status).toBe('sent');
    });

    it('handleRetryMessage deserializa mensajes con link preview', async () => {
        state.chatHistory = [{ id: 'm2', isMine: true, message: '{"text":"texto","linkPreview":{"url":"u"}}', replyTo: 'r', status: 'failed' }];
        sendMessage.mockResolvedValue({});
        await actions.handleRetryMessage('m2');
        expect(sendMessage).toHaveBeenCalledWith('peer-1', 'texto', 'r', { url: 'u' }, 'm2');
    });

    it('handleRetryMessage ignora mensajes ajenos o sin destinatario', async () => {
        state.chatHistory = [{ id: 'm3', isMine: false, message: 'x' }];
        await actions.handleRetryMessage('m3');
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('addFileTransferMessage inserta en el historial directo', () => {
        actions.addFileTransferMessage('peer-1', 'f1', 'a.txt', 5, 'text/plain', 'hash');
        expect(state.chatHistory).toHaveLength(1);
        expect((state.chatHistory as { id: string }[])[0].id).toBe('f1');
    });

    it('addFileTransferMessage inserta en el historial de grupo', () => {
        state.activeGroupId = 'grp-1';
        actions.addFileTransferMessage('grp-1', 'f2', 'b.png', 5, 'image/png', 'h');
        expect(state.groupChatHistory).toHaveLength(1);
        expect((state.groupChatHistory as { groupId: string }[])[0].groupId).toBe('grp-1');
    });

    it('updateFileTransferMessage actualiza los historiales', () => {
        state.chatHistory = [{ id: 'x', message: '{"type":"file","transferId":"f1"}' }];
        state.groupChatHistory = [{ id: 'y', message: '{"type":"file","transferId":"f1"}' }];
        actions.updateFileTransferMessage('f1', { state: 'vaulted' });
        expect((state.chatHistory as { message: string }[])[0].message).toContain('"vaulted"');
        expect((state.groupChatHistory as { message: string }[])[0].message).toContain('"vaulted"');
    });
});
