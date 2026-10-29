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
    eq: (a: unknown, b: unknown) => ({ column: a, value: b }),
    desc: (a: unknown) => ({ column: a, order: 'desc' })
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    isYggdrasilAddress: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/storage/sync/eventSink.js', () => ({
    emitSyncEvent: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/settings-sync.js', () => ({
    setSettingsClock: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/latestReaction.js', () => ({
    getLatestReactionByChat: () => new Map(),
    reactionIsNewer: () => false,
}));

const identity = vi.hoisted(() => ({ upeerId: '', alias: '', avatar: '' }));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => identity.upeerId,
    getAlias: () => identity.alias,
    getAvatar: () => identity.avatar,
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
    isContactBlocked,
    applyBlockedFromSync,
    listContactProfiles
} from '../../../src/main_process/storage/contacts/operations.js';

describe('storage/contacts/operations.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        identity.upeerId = '';
        identity.alias = '';
        identity.avatar = '';
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

        it('should name the own conversation with the profile alias instead of a deleted contact', () => {
            identity.upeerId = 'me';
            identity.alias = 'Rubén';
            identity.avatar = 'data:image/jpeg;base64,AAAA';
            mockDb.all
                .mockReturnValueOnce([])
                .mockReturnValueOnce([
                    { chatUpeerId: 'me', message: 'Hola desde el móvil', timestamp: 4000, isMine: true, status: 'sent' },
                    { chatUpeerId: 'u9', message: 'Sigo aquí', timestamp: 3000, isMine: false, status: 'delivered' }
                ]);

            const result = getContacts();

            expect(result[0]).toEqual(expect.objectContaining({
                upeerId: 'me',
                name: 'Rubén',
                avatar: 'data:image/jpeg;base64,AAAA',
                isSelf: true,
            }));
            expect(result[1]).toEqual(expect.objectContaining({ upeerId: 'u9', name: 'Contacto eliminado', isSelf: false }));
            expect(result[1].avatar).toBeUndefined();
        });

        it('should fall back to a generic self label when there is no alias yet', () => {
            identity.upeerId = 'me';
            mockDb.all
                .mockReturnValueOnce([])
                .mockReturnValueOnce([{ chatUpeerId: 'me', message: 'Hola', timestamp: 4000, isMine: true, status: 'sent' }]);

            expect(getContacts()[0]).toEqual(expect.objectContaining({ upeerId: 'me', name: 'Tú' }));
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
            mockDb.run.mockReturnValueOnce({ changes: 1 });
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

        it('bloquear avisa a los demás dispositivos con la entidad del contacto', async () => {
            const { emitSyncEvent } = await import('../../../src/main_process/storage/sync/eventSink.js');
            const { setSettingsClock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
            mockDb.run.mockReturnValueOnce({ changes: 1 });

            blockContact('peer-1');

            expect(setSettingsClock).toHaveBeenCalledWith('blocked:peer-1', expect.any(Number));
            expect(emitSyncEvent).toHaveBeenCalledWith('SETTINGS_UPDATE', {
                block: 'blocked',
                upeerId: 'peer-1',
                blocked: true,
            });
        });

        it('desbloquear avisa a los demás dispositivos con la entidad del contacto', async () => {
            const { emitSyncEvent } = await import('../../../src/main_process/storage/sync/eventSink.js');
            mockDb.run.mockReturnValueOnce({ changes: 1 });

            unblockContact('peer-2');

            expect(emitSyncEvent).toHaveBeenCalledWith('SETTINGS_UPDATE', {
                block: 'blocked',
                upeerId: 'peer-2',
                blocked: false,
            });
        });

        it('un bloqueo que no cambió nada no se anuncia', async () => {
            const { emitSyncEvent } = await import('../../../src/main_process/storage/sync/eventSink.js');
            mockDb.run.mockReturnValueOnce({ changes: 0 });

            blockContact('peer-3');

            expect(emitSyncEvent).not.toHaveBeenCalled();
        });

        it('aplicar un bloqueo recibido no lo vuelve a anunciar', async () => {
            const { emitSyncEvent } = await import('../../../src/main_process/storage/sync/eventSink.js');
            mockDb.run.mockReturnValueOnce({ changes: 1 });

            expect(applyBlockedFromSync('peer-4', true)).toBe(true);

            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }));
            expect(emitSyncEvent).not.toHaveBeenCalled();
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

    describe('listContactProfiles', () => {
        it('should publish the public key of every contact so other devices can reach them', () => {
            mockDb.all.mockReturnValueOnce([
                { upeerId: 'A'.repeat(64), name: 'Alice', avatar: null, isFavorite: true, publicKey: 'B'.repeat(64) },
                { upeerId: 'c'.repeat(64), name: 'Carol', avatar: null, isFavorite: false, publicKey: null },
                { upeerId: 'not-an-id', name: 'Broken', avatar: null, isFavorite: false, publicKey: null }
            ]);

            const profiles = listContactProfiles();

            expect(profiles).toHaveLength(2);
            expect(profiles[0]).toEqual({
                upeerId: 'a'.repeat(64),
                name: 'Alice',
                avatar: null,
                isFavorite: true,
                publicKey: 'b'.repeat(64)
            });
            expect(profiles[1].upeerId).toBe('c'.repeat(64));
            expect(profiles[1].publicKey).toBeNull();
        });
    });
});

