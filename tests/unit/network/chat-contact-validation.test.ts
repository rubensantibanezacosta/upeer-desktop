import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatContact } from '../../../src/main_process/network/handlers/chatContact.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';

type ContactWindow = NonNullable<Parameters<typeof handleChatContact>[2]>;
type ContactPacket = Parameters<typeof handleChatContact>[1];
type SendResponse = Parameters<typeof handleChatContact>[5];

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    getMessageById: vi.fn(),
}));

describe('chat contact validation', () => {
    const win = { webContents: { send: vi.fn() } } as unknown as ContactWindow;
    const sendResponse = vi.fn<SendResponse>();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(messagesOps.getMessageById).mockResolvedValue(undefined);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);
    });

    it('replaces invalid remote ids with a generated uuid', async () => {
        await handleChatContact('peer-1', {
            id: 'not-a-uuid',
            contactName: 'Alice',
            contactAddress: 'ygg-1',
            upeerId: 'peer-2',
            contactPublicKey: 'ab'.repeat(32),
        } as ContactPacket, win, 'sig', '1.2.3.4', sendResponse);

        const savedId = vi.mocked(messagesOps.saveMessage).mock.calls[0]?.[0];
        expect(savedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(savedId).not.toBe('not-a-uuid');
        expect(sendResponse).toHaveBeenCalledWith('1.2.3.4', { type: 'ACK', id: savedId, status: 'delivered' });
    });

    it('keeps a valid remote uuid unchanged', async () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000';

        await handleChatContact('peer-1', {
            id: uuid,
            contactName: 'Alice',
        } as ContactPacket, win, 'sig', '1.2.3.4', sendResponse);

        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            uuid,
            'peer-1',
            false,
            expect.any(String),
            undefined,
            'sig',
            'delivered',
            'peer-1',
            undefined
        );
        expect(sendResponse).toHaveBeenCalledWith('1.2.3.4', { type: 'ACK', id: uuid, status: 'delivered' });
    });
});
