import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de base de datos
const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
    all: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn()
};

const mockSchema = {
    contacts: {
        upeerId: { name: 'u1-col' },
        address: { name: 'addr-col' },
        knownAddresses: { name: 'known-col' },
        status: { name: 'status-col' }
    },
    messages: {
        chatUpeerId: { name: 'chatUpeerId' },
        timestamp: { name: 'timestamp' },
        message: { name: 'message' },
        isMine: { name: 'isMine' },
        status: { name: 'messageStatus' }
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

import {
    getContactByUpeerId,
    getContactByAddress,
    getContacts,
    addOrUpdateContact,
    deleteContact,
    updateContactName,
    updateContactAvatar,
    setContactFavorite,
    blockContact,
    unblockContact,
    getBlockedContacts,
    isContactBlocked
} from '../../../src/main_process/storage/contacts/operations.js';

describe('storage/contacts/operations.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getContactByUpeerId', () => {
        it('should fetch a contact by upeerId', () => {
            const mockContact = { upeerId: 'u1', name: 'Alice' };
            mockDb.get.mockReturnValueOnce(mockContact);

            const result = getContactByUpeerId('u1');
            expect(result).toEqual(mockContact);
            expect(mockDb.from).toHaveBeenCalledWith(mockSchema.contacts);
        });
    });

    describe('getContactByAddress', () => {
        it('should fetch a contact by address', () => {
            const mockContact = { address: 'addr1', name: 'Bob' };
            mockDb.get.mockReturnValueOnce(mockContact);

            const result = getContactByAddress('addr1');
            expect(result).toEqual(mockContact);
            expect(mockDb.from).toHaveBeenCalledWith(mockSchema.contacts);
        });
    });

    describe('getContacts', () => {
        it('should fetch all contacts and enrich with last message info', () => {
            const mockContacts = [
                { upeerId: 'u1', name: 'Alice', isFavorite: true },
                { upeerId: 'u2', name: 'Bob' }
            ];
            mockDb.all
                .mockReturnValueOnce(mockContacts)
                .mockReturnValueOnce([
                    { chatUpeerId: 'u1', message: 'Hello', timestamp: 1000, isMine: true, status: 'sent' }
                ]);

            const result = getContacts();

            expect(result).toHaveLength(2);
            expect(result[0].upeerId).toBe('u1');
            expect(result[0].isFavorite).toBe(true);
            expect(result[0].lastMessage).toBe('Hello');
            expect(result[1].upeerId).toBe('u2');
            expect(result[1].lastMessage).toBeUndefined();
        });

        it('should sort contacts by last message timestamp descending', () => {
            const mockContacts = [
                { upeerId: 'u1', name: 'Alice' },
                { upeerId: 'u2', name: 'Bob' }
            ];
            mockDb.all
                .mockReturnValueOnce(mockContacts)
                .mockReturnValueOnce([
                    { chatUpeerId: 'u1', timestamp: 1000 },
                    { chatUpeerId: 'u2', timestamp: 5000 }
                ]);

            const result = getContacts();
            expect(result[0].upeerId).toBe('u2');
            expect(result[1].upeerId).toBe('u1');
        });

        it('should include orphan conversations when the contact was deleted', () => {
            mockDb.all
                .mockReturnValueOnce([{ upeerId: 'u1', name: 'Alice', status: 'connected' }])
                .mockReturnValueOnce([
                    { chatUpeerId: 'u1', message: 'Hola', timestamp: 1000, isMine: false, status: 'read' },
                    { chatUpeerId: 'u3', message: 'Sigo aquí', timestamp: 4000, isMine: false, status: 'delivered' },
                    { chatUpeerId: 'grp-1', message: 'Grupo', timestamp: 3000, isMine: false, status: 'delivered' }
                ]);

            const result = getContacts();

            expect(result[0]).toEqual(expect.objectContaining({
                upeerId: 'u3',
                name: 'Contacto eliminado',
                status: 'offline',
                isConversationOnly: true,
                lastMessage: 'Sigo aquí'
            }));
            expect(result.some(contact => contact.upeerId === 'grp-1')).toBe(false);
        });
    });

    describe('addOrUpdateContact', () => {
        it('should insert or update a contact and manage knownAddresses', () => {
            // Mock existing contact with some addresses
            mockDb.get.mockReturnValueOnce({ knownAddresses: JSON.stringify(['old-addr']) });

            addOrUpdateContact(
                'u1',
                'new-primary',
                'Alice',
                'pubkey',
                'connected',
                undefined,
                undefined,
                undefined,
                undefined,
                ['extra-addr']
            );

            expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.contacts);
            // Verifica que se unieron las direcciones (new-primary al frente)
            const capturedValues = mockDb.values.mock.calls[0][0];
            const parsedKnown = JSON.parse(capturedValues.knownAddresses);
            expect(parsedKnown).toContain('extra-addr');
            expect(parsedKnown).toContain('old-addr');
        });

        it('should handle invalid JSON in existing knownAddresses', () => {
            mockDb.get.mockReturnValueOnce({ knownAddresses: 'invalid-json' });

            addOrUpdateContact('u1', 'addr1', 'Alice');

            const capturedValues = mockDb.values.mock.calls[0][0];
            expect(JSON.parse(capturedValues.knownAddresses)).toEqual(['addr1']);
        });

        it('should limit knownAddresses to 20 entries', () => {
            const manyAddresses = Array.from({ length: 25 }, (_, i) => `addr${i}`);
            mockDb.get.mockReturnValueOnce({ knownAddresses: JSON.stringify(manyAddresses) });

            addOrUpdateContact('u1', 'new-one', 'Alice');

            const capturedValues = mockDb.values.mock.calls[0][0];
            const parsed = JSON.parse(capturedValues.knownAddresses);
            expect(parsed.length).toBe(20);
            expect(parsed[0]).toBe('new-one');
        });
    });

    describe('Additional operations', () => {
        it('should delete a contact', () => {
            deleteContact('u1');
            expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should update contact name', () => {
            updateContactName('u1', 'New Name');
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith({ name: 'New Name' });
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should update contact avatar', () => {
            updateContactAvatar('u1', 'new-avatar-path');
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith({ avatar: 'new-avatar-path' });
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should update contact favorite flag', () => {
            setContactFavorite('u1', true);
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith({ isFavorite: true });
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should block contact', () => {
            blockContact('u1');
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }));
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should unblock contact', () => {
            unblockContact('u1');
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith({ status: 'incoming', blockedAt: null });
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should get all blocked contacts', () => {
            getBlockedContacts();
            expect(mockDb.select).toHaveBeenCalled();
            expect(mockDb.from).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.all).toHaveBeenCalled();
        });

        it('should check if contact is blocked', () => {
            mockDb.get.mockReturnValueOnce({ status: 'blocked' });
            expect(isContactBlocked('u1')).toBe(true);

            mockDb.get.mockReturnValueOnce({ status: 'connected' });
            expect(isContactBlocked('u2')).toBe(false);

            mockDb.get.mockReturnValueOnce(undefined);
            expect(isContactBlocked('u3')).toBe(false);
        });
    });
});

