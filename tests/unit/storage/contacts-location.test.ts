import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de base de datos
const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn()
};

const mockSchema = {
    contacts: {
        upeerId: { name: 'u1-col' },
        address: { name: 'addr-col' },
        knownAddresses: { name: 'known-col' }
    }
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: any, b: any) => ({ column: a, value: b })
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    isYggdrasilAddress: vi.fn(() => true),
}));

import { updateContactLocation, updateContactDhtLocation } from '../../../src/main_process/storage/contacts/location.js';

describe('storage/contacts/location.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('updateContactLocation', () => {
        it('should update primary address and merge in knownAddresses', async () => {
            mockDb.get.mockReturnValueOnce({ knownAddresses: JSON.stringify(['old-addr']) });

            await updateContactLocation('user1', 'new-addr');

            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                address: 'new-addr',
                knownAddresses: JSON.stringify(['new-addr', 'old-addr'])
            }));
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should handle missing existing contact gracefully', async () => {
            mockDb.get.mockReturnValueOnce(undefined);

            await updateContactLocation('user1', 'new-addr');

            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                knownAddresses: JSON.stringify(['new-addr'])
            }));
        });

        it('should handle malformed JSON in knownAddresses', async () => {
            mockDb.get.mockReturnValueOnce({ knownAddresses: 'invalid-json' });

            await updateContactLocation('user1', 'new-addr');

            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                knownAddresses: JSON.stringify(['new-addr'])
            }));
        });
    });

    describe('updateContactDhtLocation', () => {
        it('should update DHT fields and handle multiple addresses', () => {
            mockDb.get.mockReturnValueOnce({ knownAddresses: JSON.stringify(['ip1']) });

            updateContactDhtLocation(
                'user1',
                ['ip2', 'ip3'],
                10,
                'sig123',
                1234567,
                { token: 'abc' }
            );

            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                address: 'ip2',
                dhtSeq: 10,
                dhtSignature: 'sig123',
                dhtExpiresAt: 1234567,
                renewalToken: JSON.stringify({ token: 'abc' }),
                knownAddresses: JSON.stringify(['ip3', 'ip2', 'ip1'])
            }));
        });

        it('should handle single address string', () => {
            mockDb.get.mockReturnValueOnce(null);

            updateContactDhtLocation('user1', 'ip-single', 5, 'sig');

            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                address: 'ip-single',
                knownAddresses: JSON.stringify(['ip-single'])
            }));
        });
    });
});
