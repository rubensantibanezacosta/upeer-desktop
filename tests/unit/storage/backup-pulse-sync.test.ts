import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de base de datos
const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    all: vi.fn(),
    get: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    run: vi.fn()
};

const mockSchema = {
    contacts: {
        status: 'status',
        dhtSignature: 'dhtSignature',
        dhtExpiresAt: 'dhtExpiresAt',
        lastSeen: 'lastSeen',
        upeerId: 'upeerId',
        name: 'name',
        publicKey: 'publicKey',
        address: 'address',
        dhtSeq: 'dhtSeq'
    },
    backupPulseSync: {
        kitId: 'kitId',
        name: 'name',
        description: 'description',
        data: 'data',
        expires: 'expires',
        isActive: 'isActive'
    }
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: unknown, b: unknown) => ({ type: 'eq', column: a, value: b })
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn()
}));

import { createPulseSync, getPulseSync } from '../../../src/main_process/storage/backup/pulse-sync.js';
import { error } from '../../../src/main_process/security/secure-logger.js';

describe('storage/backup/pulse-sync.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2023-01-01'));
    });

    describe('createPulseSync', () => {
        it('should create a pulse sync with active contacts', () => {
            const now = Date.now();
            const mockContacts = [
                {
                    upeerId: 'u1', name: 'Alice', status: 'connected',
                    dhtSignature: 'sig', dhtExpiresAt: now + 1000,
                    lastSeen: new Date(now - 100).toISOString(),
                    address: 'addr1', dhtSeq: 1, publicKey: 'pub1'
                },
                {
                    upeerId: 'u2', name: 'Expired', status: 'connected',
                    dhtSignature: 'sig', dhtExpiresAt: now - 1000
                }
            ];
            mockDb.all.mockReturnValueOnce(mockContacts);

            const kitId = createPulseSync('My Pulse', 'Desc');

            expect(kitId).toBeDefined();
            expect(mockDb.insert).toHaveBeenCalled();
            const values = mockDb.values.mock.calls[0][0];
            const data = JSON.parse(values.data);

            expect(data.contacts).toHaveLength(1);
            expect(data.contacts[0].upeerId).toBe('u1');
            expect(data.contacts[0].locationBlock.address).toBe('addr1');
        });

        it('should handle contacts without lastSeen or signatures', () => {
            mockDb.all.mockReturnValueOnce([{
                upeerId: 'u1', name: 'Alice', status: 'connected',
                dhtSignature: 'sig', dhtExpiresAt: Date.now() + 1000,
                lastSeen: null, address: 'addr1', publicKey: null
            }]);

            createPulseSync('Test');
            const data = JSON.parse(mockDb.values.mock.calls[0][0].data);
            expect(data.contacts[0].lastSeen).toBeDefined();
            expect(data.contacts[0].publicKey).toBe('');
        });

        it('should sort contacts by lastSeen and slice to top 50', () => {
            const now = Date.now();
            const contacts = Array.from({ length: 60 }, (_, i) => ({
                upeerId: `u${i}`, status: 'connected', dhtSignature: 's',
                dhtExpiresAt: now + 1000, lastSeen: new Date(now - i * 1000).toISOString()
            }));
            mockDb.all.mockReturnValueOnce(contacts);

            createPulseSync('Scale');
            const data = JSON.parse(mockDb.values.mock.calls[0][0].data);
            expect(data.contacts).toHaveLength(50);
            expect(data.contacts[0].upeerId).toBe('u0'); // El más reciente
        });
    });

    describe('getPulseSync', () => {
        it('should return parsed pulse data', () => {
            const mockData = { version: '1.0', contacts: [] };
            mockDb.get.mockReturnValueOnce({ data: JSON.stringify(mockData) });

            const result = getPulseSync('p1');
            expect(result).toEqual(mockData);
        });

        it('should return null if not found', () => {
            mockDb.get.mockReturnValueOnce(null);
            expect(getPulseSync('p1')).toBeNull();
        });

        it('should log error and return null on invalid JSON', () => {
            mockDb.get.mockReturnValueOnce({ data: 'invalid-json' });
            const result = getPulseSync('p1');
            expect(result).toBeNull();
            expect(error).toHaveBeenCalled();
        });
    });
});
