import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import { updateContactStatus, updateLastSeen } from '../../../src/main_process/storage/contacts/status.js';
import { updateContactLocation, updateContactDhtLocation } from '../../../src/main_process/storage/contacts/location.js';

// Mocks para drizzle/sqlite
const mockRun = vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }));
const mockGet = vi.fn();
const mockAll = vi.fn();

const mockDb = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    get: mockGet,
    all: mockAll,
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    onConflictDoUpdate: vi.fn(() => mockDb),
    run: mockRun,
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
};

const mockSchema = {
    contacts: {
        upeerId: 'upeerId',
        address: 'address',
        name: 'name',
        publicKey: 'publicKey',
        ephemeralPublicKey: 'ephemeralPublicKey',
        status: 'status',
        knownAddresses: 'knownAddresses',
        blockedAt: 'blockedAt',
        avatar: 'avatar'
    },
    messages: {
        chatUpeerId: 'chatUpeerId',
        timestamp: 'timestamp',
        message: 'message',
        isMine: 'isMine',
        status: 'status'
    }
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: any, b: any) => ({ column: a, value: b }),
    desc: (a: any) => ({ column: a, order: 'desc' })
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    isYggdrasilAddress: vi.fn(() => true),
}));

describe('Contacts Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRun.mockReset();
        mockGet.mockReset();
        mockAll.mockReset();
    });

    it('should add or update a contact correctly', () => {
        mockGet.mockReturnValueOnce(undefined); // No existe previo

        contactsOps.addOrUpdateContact('peer1', '127.0.0.1', 'Alice');

        expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.contacts);
        expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalled();
    });

    it('should get contact by upeerId', () => {
        const fakeContact = { upeerId: 'peer1', name: 'Alice' };
        mockGet.mockReturnValueOnce(fakeContact);

        const result = contactsOps.getContactByUpeerId('peer1');
        expect(result).toEqual(fakeContact);
        expect(mockDb.where).toHaveBeenCalled();
    });

    it('should get all contacts with last message info', () => {
        const fakeContacts = [{ upeerId: 'peer1', name: 'Alice', isFavorite: true }];
        const fakeMessages = [{ chatUpeerId: 'peer1', message: 'Hola', timestamp: 1234, isMine: true, status: 'sent' }];

        mockAll.mockReturnValueOnce(fakeContacts);
        mockAll.mockReturnValueOnce(fakeMessages);

        const result = contactsOps.getContacts();

        expect(result[0].lastMessage).toBe('Hola');
        expect(result[0].upeerId).toBe('peer1');
        expect(result[0].isFavorite).toBe(true);
    });

    it('should block and unblock a contact', () => {
        contactsOps.blockContact('peer1');
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }));

        contactsOps.unblockContact('peer1');
        expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'incoming', blockedAt: null }));
    });

    it('should check if a contact is blocked', () => {
        mockGet.mockReturnValueOnce({ status: 'blocked' });
        expect(contactsOps.isContactBlocked('peer1')).toBe(true);

        mockGet.mockReturnValueOnce({ status: 'connected' });
        expect(contactsOps.isContactBlocked('peer1')).toBe(false);
    });

    it('should update contact name and avatar', () => {
        contactsOps.updateContactName('peer1', 'New Name');
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ name: 'New Name' });

        contactsOps.updateContactAvatar('peer1', 'base64-avatar');
        expect(mockDb.set).toHaveBeenCalledWith({ avatar: 'base64-avatar' });
    });

    it('should update favorite status for a contact', () => {
        contactsOps.setContactFavorite('peer1', true);
        expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
        expect(mockDb.set).toHaveBeenCalledWith({ isFavorite: true });
    });

    it('should delete a contact', () => {
        contactsOps.deleteContact('peer1');
        expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.contacts);
        expect(mockDb.where).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalled();
    });

    it('should get contact by address', () => {
        const mockContact = { upeerId: 'peer1', address: 'addr1' };
        mockGet.mockReturnValueOnce(mockContact);

        const result = contactsOps.getContactByAddress('addr1');
        expect(result).toEqual(mockContact);
    });

    it('should get all contacts with last message info', () => {
        const mockContacts = [{ upeerId: 'peer1', name: 'Alice' }];
        const mockMessages = [{ chatUpeerId: 'peer1', message: 'Hi', timestamp: 1000, isMine: true, status: 'sent' }];

        mockAll.mockReturnValueOnce(mockContacts);
        mockAll.mockReturnValueOnce(mockMessages);

        const result = contactsOps.getContacts();
        expect(result[0].name).toBe('Alice');
        expect(result[0].lastMessage).toBe('Hi');
    });

    it('should get blocked contacts', () => {
        const mockBlocked = [{ upeerId: 'peer2', status: 'blocked' }];
        mockAll.mockReturnValueOnce(mockBlocked);

        const result = contactsOps.getBlockedContacts();
        expect(result).toEqual(mockBlocked);
    });

    it('should handle address merging in addOrUpdateContact and errors', () => {
        // Simular contacto existente con direcciones previas
        mockGet.mockReturnValueOnce({ knownAddresses: JSON.stringify(['old-addr']) });
        contactsOps.addOrUpdateContact('peer1', 'new-addr', 'Alice');

        expect(mockDb.insert).toHaveBeenCalled();
        const callArgs = (mockDb.values as any).mock.calls[0][0];
        const known = JSON.parse(callArgs.knownAddresses);
        expect(known[0]).toBe('new-addr');

        // Test error handling in merge
        mockGet.mockReturnValueOnce({ knownAddresses: 'invalid-json' });
        contactsOps.addOrUpdateContact('peer1', 'err-addr', 'Bob');
        expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update contact status and lastSeen', () => {
        updateContactStatus('peer1', 'connected');
        expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
        expect(mockDb.set).toHaveBeenCalledWith({ status: 'connected' });

        updateLastSeen('peer1');
        expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
            lastSeen: expect.any(String)
        }));
    });

    it('should update contact location and DHT location', async () => {
        // mock existing for merge
        mockGet.mockReturnValue({ knownAddresses: JSON.stringify(['addr1']) });

        await updateContactLocation('peer1', 'addr2');
        expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
        expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
            address: 'addr2'
        }));

        updateContactDhtLocation('peer1', ['addr3'], 1, 'sig');
        expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
            dhtSeq: 1,
            dhtSignature: 'sig'
        }));
    });
});
