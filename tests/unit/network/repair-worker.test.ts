import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockWhere,
    mockFrom,
    mockSelect,
    mockSendSecureUDPMessage,
    mockGetContacts,
    mockGetMyUPeerId,
    mockGetExpiringSoonEntries,
    mockRenewVaultEntry,
    mockDecode,
    mockEncode,
} = vi.hoisted(() => ({
    mockWhere: vi.fn(),
    mockFrom: vi.fn(),
    mockSelect: vi.fn(),
    mockSendSecureUDPMessage: vi.fn(),
    mockGetContacts: vi.fn(),
    mockGetMyUPeerId: vi.fn(() => 'self-peer'),
    mockGetExpiringSoonEntries: vi.fn(),
    mockRenewVaultEntry: vi.fn(),
    mockDecode: vi.fn(),
    mockEncode: vi.fn(),
}));

const mockDb = {
    select: mockSelect,
};

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/schema.js', () => ({
    distributedAssets: { fileHash: 'fileHash' },
    redundancyHealth: { healthStatus: 'healthStatus' },
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(() => mockDb),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    getExpiringSoonEntries: mockGetExpiringSoonEntries,
    renewVaultEntry: mockRenewVaultEntry,
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VAULT_RENEW_MS: 45 * 24 * 60 * 60 * 1000,
    VAULT_TTL_MS: 60 * 24 * 60 * 60 * 1000,
}));

vi.mock('../../../src/main_process/network/redundancy/erasure.js', async () => {
    return {
        ErasureCoder: class {
            decode = mockDecode;
            encode = mockEncode;
        },
    };
});

vi.mock('../../../src/main_process/network/vault/redundancy/erasure.js', async () => {
    return {
        ErasureCoder: class {
            decode = mockDecode;
            encode = mockEncode;
        },
    };
});

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: mockSendSecureUDPMessage,
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: mockGetContacts,
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: mockGetMyUPeerId,
}));

import { RepairWorker } from '../../../src/main_process/network/vault/repair-worker.js';
import { renewExpiringVaultEntries, runLazyVaultMaintenance } from '../../../src/main_process/network/vault/repairWorkerMaintenance.js';
import {
    collectMissingVaultShards,
    redistributeVaultSegmentShards,
    repairVaultAsset,
} from '../../../src/main_process/network/vault/repairWorkerRepair.js';

type DistributedShard = {
    shardIndex: number;
    data: string;
    segmentIndex?: number | null;
};

type RepairWorkerInternals = {
    runMaintenance: () => Promise<void>;
    renewExpiring: () => Promise<void>;
    repairAsset: (fileHash: string) => Promise<void>;
    reconstructSegment: (fileHash: string, segIdx: number, shards: DistributedShard[]) => Promise<void>;
    collectMissingShards: (fileHash: string, segIdx: number, missingIndices: number[]) => Promise<void>;
    redistributeSegmentShards: (fileHash: string, segIdx: number, segmentData: Buffer) => Promise<void>;
};

const repairWorkerInternals = RepairWorker as unknown as RepairWorkerInternals;

describe('RepairWorker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        mockWhere.mockResolvedValue([]);
        mockFrom.mockReturnValue({ where: mockWhere });
        mockSelect.mockReturnValue({ from: mockFrom });
        mockGetContacts.mockResolvedValue([]);
        mockGetExpiringSoonEntries.mockResolvedValue([]);
        mockDecode.mockReturnValue(Buffer.from('reconstructed'));
        mockEncode.mockReturnValue([Buffer.from('aa', 'hex'), Buffer.from('bb', 'hex'), Buffer.from('cc', 'hex'), Buffer.from('dd', 'hex')]);
        RepairWorker.stop();
    });

    it('starts once and stops cleanly', async () => {
        vi.useFakeTimers();
        const maintenanceSpy = vi.spyOn(repairWorkerInternals, 'runMaintenance').mockResolvedValue(undefined);

        RepairWorker.start();
        RepairWorker.start();

        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        expect(maintenanceSpy).toHaveBeenCalledTimes(1);

        RepairWorker.stop();
        await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
        expect(maintenanceSpy).toHaveBeenCalledTimes(1);
    });

    it('renews expiring entries and notifies eligible custodians', async () => {
        const now = 1_700_000_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        mockGetExpiringSoonEntries.mockResolvedValue([
            { payloadHash: 'hash-1', recipientSid: 'recipient-peer' },
        ]);
        mockGetContacts.mockResolvedValue([
            { upeerId: 'self-peer', address: 'self-addr', status: 'connected' },
            { upeerId: 'recipient-peer', address: 'recipient-addr', status: 'connected' },
            { upeerId: 'custodian-1', address: 'addr-1', status: 'connected' },
            { upeerId: 'custodian-2', address: 'addr-2', status: 'connected' },
            { upeerId: 'offline-peer', address: 'addr-3', status: 'disconnected' },
        ]);

        await renewExpiringVaultEntries();

        expect(mockRenewVaultEntry).toHaveBeenCalledWith('hash-1', now + 60 * 24 * 60 * 60 * 1000);
        expect(mockSendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(mockSendSecureUDPMessage).toHaveBeenNthCalledWith(1, 'addr-1', expect.objectContaining({ type: 'VAULT_RENEW', payloadHash: 'hash-1' }));
        expect(mockSendSecureUDPMessage).toHaveBeenNthCalledWith(2, 'addr-2', expect.objectContaining({ type: 'VAULT_RENEW', payloadHash: 'hash-1' }));
    });

    it('repairs degraded assets at or below threshold during maintenance', async () => {
        mockWhere
            .mockResolvedValueOnce([
                { assetHash: 'repair-me', availableShards: 6 },
                { assetHash: 'healthy-enough', availableShards: 7 },
            ]);
        const repairSpy = vi.spyOn(repairWorkerInternals, 'repairAsset').mockResolvedValue(undefined);
        const renewSpy = vi.spyOn(repairWorkerInternals, 'renewExpiring').mockResolvedValue(undefined);

        await runLazyVaultMaintenance(6, renewSpy, repairSpy);

        expect(renewSpy).toHaveBeenCalledOnce();
        expect(repairSpy).toHaveBeenCalledTimes(1);
        expect(repairSpy).toHaveBeenCalledWith('repair-me');
    });

    it('reconstructs segments when enough shards exist and queries custodians otherwise', async () => {
        mockWhere.mockResolvedValueOnce([
            { shardIndex: 0, data: 'aa', segmentIndex: 0 },
            { shardIndex: 1, data: 'bb', segmentIndex: 0 },
            { shardIndex: 2, data: 'cc', segmentIndex: 0 },
            { shardIndex: 3, data: 'dd', segmentIndex: 0 },
            { shardIndex: 0, data: 'ee', segmentIndex: 1 },
            { shardIndex: 1, data: 'ff', segmentIndex: 1 },
        ]);
        const reconstructSpy = vi.spyOn(repairWorkerInternals, 'reconstructSegment').mockResolvedValue(undefined);
        const collectSpy = vi.spyOn(repairWorkerInternals, 'collectMissingShards').mockResolvedValue(undefined);

        await repairVaultAsset('file-hash', reconstructSpy, collectSpy);

        expect(reconstructSpy).toHaveBeenCalledWith('file-hash', 0, expect.any(Array));
        expect(collectSpy).toHaveBeenCalledWith('file-hash', 1, expect.any(Array));
    });

    it('collects missing shards from connected custodians', async () => {
        vi.useFakeTimers();
        mockGetContacts.mockResolvedValue([
            { upeerId: 'self-peer', address: 'self-addr', status: 'connected' },
            { upeerId: 'custodian-1', address: 'addr-1', status: 'connected' },
            { upeerId: 'custodian-2', address: 'addr-2', status: 'connected' },
        ]);

        const promise = collectMissingVaultShards('file-hash', 2, [0, 3]);
        await vi.runAllTimersAsync();
        await promise;

        expect(mockSendSecureUDPMessage).toHaveBeenCalledTimes(4);
        expect(mockSendSecureUDPMessage).toHaveBeenCalledWith('addr-1', expect.objectContaining({ type: 'VAULT_QUERY', payloadHash: 'shard:file-hash:2:0' }));
        expect(mockSendSecureUDPMessage).toHaveBeenCalledWith('addr-2', expect.objectContaining({ type: 'VAULT_QUERY', payloadHash: 'shard:file-hash:2:3' }));
    });

    it('redistributes reconstructed shards when enough custodians exist', async () => {
        mockGetContacts.mockResolvedValue([
            { upeerId: 'self-peer', address: 'self-addr', status: 'connected' },
            { upeerId: 'custodian-1', address: 'addr-1', status: 'connected' },
            { upeerId: 'custodian-2', address: 'addr-2', status: 'connected' },
            { upeerId: 'custodian-3', address: 'addr-3', status: 'connected' },
            { upeerId: 'custodian-4', address: 'addr-4', status: 'connected' },
        ]);

        await redistributeVaultSegmentShards('file-hash', 4, Buffer.from('segment-data'));

        expect(mockEncode).toHaveBeenCalledOnce();
        expect(mockSendSecureUDPMessage).toHaveBeenCalledTimes(4);
        expect(mockSendSecureUDPMessage).toHaveBeenCalledWith('addr-1', expect.objectContaining({ type: 'VAULT_STORE', payloadHash: 'shard:file-hash:4:0' }));
    });

    it('espera a que terminen los envíos antes de resolver la redistribución', async () => {
        mockGetContacts.mockResolvedValue([
            { upeerId: 'self-peer', address: 'self-addr', status: 'connected' },
            { upeerId: 'custodian-1', address: 'addr-1', status: 'connected' },
            { upeerId: 'custodian-2', address: 'addr-2', status: 'connected' },
            { upeerId: 'custodian-3', address: 'addr-3', status: 'connected' },
            { upeerId: 'custodian-4', address: 'addr-4', status: 'connected' },
        ]);

        let releaseSend: (() => void) | undefined;
        const sendBarrier = new Promise<void>((resolve) => {
            releaseSend = resolve;
        });

        mockSendSecureUDPMessage.mockImplementation(() => sendBarrier);

        let resolved = false;
        const redistribution = redistributeVaultSegmentShards('file-hash', 4, Buffer.from('segment-data'))
            .then(() => {
                resolved = true;
            });

        for (let attempt = 0; attempt < 10 && mockSendSecureUDPMessage.mock.calls.length < 4; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        expect(mockSendSecureUDPMessage).toHaveBeenCalledTimes(4);
        expect(resolved).toBe(false);

        releaseSend?.();
        await redistribution;

        expect(resolved).toBe(true);
    });
});
