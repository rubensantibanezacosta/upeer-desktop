import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRenewalService, stopRenewalService } from '../../../src/main_process/network/dht/renewal.js';
import * as sharedStorage from '../../../src/main_process/storage/shared.js';
import * as networkUtils from '../../../src/main_process/network/utils.js';
import * as handlers from '../../../src/main_process/network/dht/handlers.js';

type MockRenewalDb = {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
};

// Mock de la base de datos y utilidades
vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(() => ({
        contacts: {
            upeerId: 'upeerId',
            dhtExpiresAt: 'dhtExpiresAt',
            renewalToken: 'renewalToken',
            address: 'address',
            knownAddresses: 'knownAddresses',
            dhtSeq: 'dhtSeq',
            deviceMeta: 'deviceMeta'
        }
    })),
    and: vi.fn(),
    lt: vi.fn(),
    eq: vi.fn()
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    generateSignedLocationBlock: vi.fn(),
    getNetworkAddresses: vi.fn(() => ['127.0.0.1']),
    AUTO_RENEW_THRESHOLD_MS: 3600 * 1000 // 1 hora para el test
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    publishLocationBlock: vi.fn(async () => { })
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    network: vi.fn(),
    warn: vi.fn()
}));

describe('DHT Renewal Service', () => {
    let mockDb: MockRenewalDb;

    beforeEach(() => {
        vi.useFakeTimers();
        mockDb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            all: vi.fn().mockReturnValue([]),
            run: vi.fn()
        };
        vi.mocked(sharedStorage.getDb).mockReturnValue(mockDb as never);
    });

    afterEach(() => {
        stopRenewalService();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should start the interval and perform first check after 10s', async () => {
        startRenewalService();
        expect(vi.getTimerCount()).toBe(2); // interval + first timeout

        await vi.advanceTimersByTimeAsync(11000);
        expect(mockDb.select).toHaveBeenCalled();
    });

    it('should attempt renewal for contacts with renewalToken near expiration', async () => {
        const mockContact = {
            upeerId: 'peer-1',
            dhtExpiresAt: 100,
            renewalToken: JSON.stringify({ signature: 'sig', targetId: 'peer-1' }),
            address: '1.2.3.4',
            dhtSeq: 5
        };
        mockDb.all.mockReturnValue([mockContact]);
        vi.mocked(networkUtils.generateSignedLocationBlock).mockReturnValue({
            expiresAt: 200000,
            signature: 'new-sig'
        } as ReturnType<typeof networkUtils.generateSignedLocationBlock>);

        startRenewalService();
        await vi.advanceTimersByTimeAsync(11000);

        expect(handlers.publishLocationBlock).toHaveBeenCalled();
        expect(mockDb.update).toHaveBeenCalled();
    });

    it('should stop the service when stopRenewalService is called', () => {
        startRenewalService();
        expect(vi.getTimerCount()).toBe(2);
        stopRenewalService();
        expect(vi.getTimerCount()).toBe(0);
    });
});
