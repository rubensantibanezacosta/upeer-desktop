import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { registerContactHandlers } from '../../../../src/main_process/core/ipcHandlers/contacts.js';
import * as contactsOps from '../../../../src/main_process/storage/contacts/operations.js';
import * as contactsMessaging from '../../../../src/main_process/network/messaging/contacts.js';

type AddContactPayload = { address: string; name: string };
type AddContactResult = { success: boolean; upeerId?: string; error?: string };
type AddContactHandler = (event: unknown, payload: AddContactPayload) => Promise<AddContactResult>;

function getAddContactHandler(): AddContactHandler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'add-contact');
    if (!call) throw new Error('Missing add-contact handler');
    return call[1] as AddContactHandler;
}

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn(),
    },
}));

vi.mock('../../../../src/main_process/core/windowManager.js', () => ({
    getAllWindows: vi.fn(() => []),
}));

vi.mock('../../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(async () => []),
    getContactByAddress: vi.fn(async () => null),
    deleteContact: vi.fn(async () => undefined),
    addOrUpdateContact: vi.fn(),
    blockContact: vi.fn(),
    unblockContact: vi.fn(),
    getBlockedContacts: vi.fn(async () => []),
    setContactFavorite: vi.fn(),
}));

vi.mock('../../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessagesByChatId: vi.fn(),
}));

vi.mock('../../../../src/main_process/network/messaging/contacts.js', () => ({
    sendContactRequest: vi.fn(async () => undefined),
    acceptContactRequest: vi.fn(async () => undefined),
}));

vi.mock('../../../../src/main_process/network/messaging/chat.js', () => ({
    sendChatClear: vi.fn(async () => undefined),
}));

vi.mock('../../../../src/main_process/security/reputation/vouches.js', () => ({
    computeScore: vi.fn(() => 100),
    getDirectContactIds: vi.fn(async () => new Set<string>()),
}));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

describe('Contacts IPC Handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerContactHandlers();
    });

    it('registers the add-contact handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('add-contact', expect.any(Function));
    });

    it('accepts a valid Yggdrasil address in 300::/8', async () => {
        const handler = getAddContactHandler();

        const result = await handler({}, { address: 'peer-123@301:5884:ec67:1c3e:d713:8b32:ed5e:9de3', name: 'Alice' });

        expect(result).toEqual({ success: true, upeerId: 'peer-123' });
        expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
            'peer-123',
            '301:5884:ec67:1c3e:d713:8b32:ed5e:9de3',
            'Alice',
            undefined,
            'pending'
        );
        expect(contactsMessaging.sendContactRequest).toHaveBeenCalledWith('301:5884:ec67:1c3e:d713:8b32:ed5e:9de3');
    });

    it('accepts compressed Yggdrasil addresses', async () => {
        const handler = getAddContactHandler();

        const result = await handler({}, { address: 'peer-123@300::1', name: 'Alice' });

        expect(result).toEqual({ success: true, upeerId: 'peer-123' });
        expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
            'peer-123',
            '300::1',
            'Alice',
            undefined,
            'pending'
        );
    });

    it('rejects valid IPv6 addresses outside Yggdrasil ranges', async () => {
        const handler = getAddContactHandler();

        const result = await handler({}, { address: 'peer-123@fe80::1', name: 'Alice' });

        expect(result.success).toBe(false);
        expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
    });

    it('rejects malformed IPv6 addresses even if they start with a 2xx prefix', async () => {
        const handler = getAddContactHandler();

        const result = await handler({}, { address: 'peer-123@201:zzzz::1', name: 'Alice' });

        expect(result.success).toBe(false);
        expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
    });
});