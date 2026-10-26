import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vaultQuery from '../../../src/main_process/network/vault/protocol/query.js';
import * as vaultHandlers from '../../../src/main_process/network/vault/protocol/handlers.js';
import * as vaultDb from '../../../src/main_process/storage/vault/operations.js';
import * as vouches from '../../../src/main_process/security/reputation/vouches.js';
import type { VaultQueryData, VaultStoreData } from '../../../src/main_process/network/types.js';

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn(),
    getVaultEntriesPageForRecipient: vi.fn(),
    getVaultShardEntriesForFile: vi.fn().mockResolvedValue([]),
    deleteVaultEntry: vi.fn(),
    getSenderUsage: vi.fn(),
    renewVaultEntry: vi.fn(),
    getVaultEntryByHash: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    computeScore: vi.fn().mockReturnValue(50),
    issueVouch: vi.fn().mockResolvedValue(true),
    VouchType: {
        VAULT_RETRIEVED: 'VAULT_RETRIEVED',
        VAULT_CHUNK: 'VAULT_CHUNK',
        MALICIOUS: 'MALICIOUS',
        INTEGRITY_FAIL: 'INTEGRITY_FAIL'
    }
}));

describe('Vault Protocol Handlers', () => {
    const senderSid = 'sender-1';
    const mockSendResponse = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleVaultStore', () => {
        it('should store entry if quota and score are valid', async () => {
            const data: VaultStoreData = {
                payloadHash: 'hash1',
                recipientSid: 'recp1',
                senderSid,
                data: '00112233',
                priority: 1,
                expiresAt: Date.now() + 1000
            };
            vi.mocked(vaultDb.getSenderUsage).mockResolvedValue(0);
            vi.mocked(vouches.computeScore).mockReturnValue(70);

            await vaultHandlers.handleVaultStore(senderSid, data, '1.1.1.1', mockSendResponse);

            expect(vaultDb.saveVaultEntry).toHaveBeenCalledWith(
                'hash1', 'recp1', senderSid, 1, '00112233', expect.any(Number)
            );
            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({ type: 'VAULT_ACK' }));
        });

        it('stores the recipient device scope', async () => {
            const deviceId = 'ab'.repeat(32);
            const data: VaultStoreData = {
                payloadHash: 'hash-device',
                recipientSid: 'recp1',
                recipientDeviceId: deviceId,
                senderSid,
                data: '00112233',
                priority: 1,
                expiresAt: Date.now() + 1000
            };
            vi.mocked(vaultDb.getSenderUsage).mockResolvedValue(0);
            vi.mocked(vouches.computeScore).mockReturnValue(70);

            await vaultHandlers.handleVaultStore(senderSid, data, '1.1.1.1', mockSendResponse);

            expect(vaultDb.saveVaultEntry).toHaveBeenCalledWith(
                'hash-device', 'recp1', senderSid, 1, '00112233', expect.any(Number), deviceId
            );
        });

        it('should refuse if score is too low', async () => {
            vi.mocked(vouches.computeScore).mockReturnValue(20);
            await vaultHandlers.handleVaultStore(senderSid, {} as VaultStoreData);
            expect(vaultDb.saveVaultEntry).not.toHaveBeenCalled();
        });

        it('should refuse if quota exceeded', async () => {
            vi.mocked(vouches.computeScore).mockReturnValue(50);
            vi.mocked(vaultDb.getSenderUsage).mockResolvedValue(60 * 1024 * 1024);
            await vaultHandlers.handleVaultStore(senderSid, { data: 'aa', payloadHash: 'h', recipientSid: 'r' } as unknown as VaultStoreData);
            expect(vaultDb.saveVaultEntry).not.toHaveBeenCalled();
        });
    });

    describe('handleVaultQuery', () => {
        it('should deliver entries for authorized requester', async () => {
            const entries = [{ id: 1, payloadHash: 'h1' }, { id: 2, payloadHash: 'h2' }];
            vi.mocked(vaultDb.getVaultEntriesPageForRecipient).mockResolvedValue(entries as never);

            await vaultQuery.deliverVaultQuery(senderSid, { requesterSid: senderSid, timestamp: Date.now() } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                type: 'VAULT_DELIVERY',
                entries: expect.arrayContaining([{ id: 1, payloadHash: 'h1' }])
            }));
        });

        it('paginates by stable entry ID and fetches one extra entry to detect continuation', async () => {
            const entries = Array.from({ length: 121 }, (_, index) => ({ id: index + 121, payloadHash: `h${index + 121}` }));
            vi.mocked(vaultDb.getVaultEntriesPageForRecipient).mockResolvedValue(entries as never);

            await vaultQuery.deliverVaultQuery(senderSid, {
                requesterSid: senderSid,
                timestamp: Date.now(),
                afterId: 120,
            } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(vaultDb.getVaultEntriesPageForRecipient).toHaveBeenCalledWith(senderSid, 120, 121, null);
            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                hasMore: true,
                nextAfterId: 240,
                entries: expect.arrayContaining([{ id: 240, payloadHash: 'h240' }]),
            }));
            expect(mockSendResponse.mock.calls[0][1].entries).toHaveLength(120);
        });

        it('scopes the mailbox to the requesting device', async () => {
            const deviceId = 'ab'.repeat(32);
            vi.mocked(vaultDb.getVaultEntriesPageForRecipient).mockResolvedValue([] as never);

            await vaultQuery.deliverVaultQuery(senderSid, {
                requesterSid: senderSid,
                requesterDeviceId: deviceId,
                timestamp: Date.now(),
            } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(vaultDb.getVaultEntriesPageForRecipient).toHaveBeenCalledWith(
                senderSid, undefined, 121, deviceId
            );
        });

        it('does not deliver a device-specific entry to another device', async () => {
            const entry = {
                payloadHash: 'h1',
                recipientSid: senderSid,
                recipientDeviceId: 'ab'.repeat(32),
            };
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(entry as never);

            await vaultQuery.deliverVaultQuery(senderSid, {
                requesterSid: senderSid,
                requesterDeviceId: 'cd'.repeat(32),
                timestamp: Date.now(),
                payloadHash: 'h1',
            } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(mockSendResponse).not.toHaveBeenCalled();
        });

        it('should refuse unauthorized query (senderSid != requesterSid)', async () => {
            await vaultQuery.deliverVaultQuery(senderSid, { requesterSid: 'other', timestamp: Date.now() } as VaultQueryData, '1.1.1.1', mockSendResponse);
            expect(mockSendResponse).not.toHaveBeenCalled();
        });

        it('should return specific entry if payloadHash requested', async () => {
            const entry = { payloadHash: 'h1', recipientSid: senderSid };
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(entry as never);

            await vaultQuery.deliverVaultQuery(senderSid, { requesterSid: senderSid, timestamp: Date.now(), payloadHash: 'h1' } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                entries: [entry]
            }));
        });

        it('delivers the shards of a single file without paging the whole mailbox', async () => {
            const shards = [
                { payloadHash: `shard:${'f'.repeat(64)}:0:0`, recipientSid: senderSid },
                { payloadHash: `shard:${'f'.repeat(64)}:0:1`, recipientSid: senderSid },
            ];
            vi.mocked(vaultDb.getVaultShardEntriesForFile).mockResolvedValue(shards as never);

            await vaultQuery.deliverVaultQuery(senderSid, {
                requesterSid: senderSid,
                timestamp: Date.now(),
                fileHash: 'f'.repeat(64),
            } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(vaultDb.getVaultShardEntriesForFile).toHaveBeenCalledWith(senderSid, 'f'.repeat(64), null, undefined, 121);
            expect(vaultDb.getVaultEntriesPageForRecipient).not.toHaveBeenCalled();
            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                entries: shards,
                hasMore: false,
            }));
        });

        it('pages the shards of a large file so the requester can continue', async () => {
            const shards = Array.from({ length: 121 }, (_, index) => ({
                id: 1000 + index,
                payloadHash: `shard:${'f'.repeat(64)}:0:${index}`,
                recipientSid: senderSid,
            }));
            vi.mocked(vaultDb.getVaultShardEntriesForFile).mockResolvedValue(shards as never);

            await vaultQuery.deliverVaultQuery(senderSid, {
                requesterSid: senderSid,
                timestamp: Date.now(),
                fileHash: 'f'.repeat(64),
                afterId: 999,
            } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(vaultDb.getVaultShardEntriesForFile).toHaveBeenCalledWith(senderSid, 'f'.repeat(64), null, 999, 121);
            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                hasMore: true,
                nextAfterId: 1119,
            }));
        });

        it('stays silent for a file whose shards are not held here', async () => {
            vi.mocked(vaultDb.getVaultShardEntriesForFile).mockResolvedValue([] as never);

            await vaultQuery.deliverVaultQuery(senderSid, {
                requesterSid: senderSid,
                timestamp: Date.now(),
                fileHash: 'f'.repeat(64),
            } as VaultQueryData, '1.1.1.1', mockSendResponse);

            expect(mockSendResponse).not.toHaveBeenCalled();
        });
    });

    describe('handleVaultAck', () => {
        it('should delete entries if sender is the legitimate recipient', async () => {
            const entry = { payloadHash: 'h1', recipientSid: senderSid };
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(entry as never);
            vi.mocked(vaultDb.deleteVaultEntry).mockResolvedValue(true);

            await vaultHandlers.handleVaultAck(senderSid, { payloadHashes: ['h1'] });

            expect(vaultDb.deleteVaultEntry).toHaveBeenCalledWith('h1');
        });

        it('only deletes device-specific entries for the acknowledging device', async () => {
            const deviceId = 'ab'.repeat(32);
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue({
                payloadHash: 'h-device',
                recipientSid: senderSid,
                recipientDeviceId: deviceId,
            } as never);
            vi.mocked(vaultDb.deleteVaultEntry).mockResolvedValue(true);

            await vaultHandlers.handleVaultAck(senderSid, { payloadHashes: ['h-device'], deviceId });

            expect(vaultDb.deleteVaultEntry).toHaveBeenCalledWith('h-device');
        });

        it('rejects an ACK from another device', async () => {
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue({
                payloadHash: 'h-device',
                recipientSid: senderSid,
                recipientDeviceId: 'ab'.repeat(32),
            } as never);

            await vaultHandlers.handleVaultAck(senderSid, {
                payloadHashes: ['h-device'],
                deviceId: 'cd'.repeat(32),
            });

            expect(vaultDb.deleteVaultEntry).not.toHaveBeenCalled();
            expect(vouches.issueVouch).toHaveBeenCalledWith(senderSid, 'MALICIOUS');
        });

        it('should not reward reputation for unknown ack hashes', async () => {
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(undefined);

            await vaultHandlers.handleVaultAck(senderSid, { payloadHashes: ['missing-hash'] });

            expect(vaultDb.deleteVaultEntry).not.toHaveBeenCalled();
            expect(vouches.issueVouch).not.toHaveBeenCalled();
        });

        it('should ignore and issue malicious vouch if sender is not recipient', async () => {
            const entry = { payloadHash: 'h1', recipientSid: 'other' };
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(entry as never);

            await vaultHandlers.handleVaultAck(senderSid, { payloadHashes: ['h1'] });

            expect(vaultDb.deleteVaultEntry).not.toHaveBeenCalled();
            expect(vouches.issueVouch).toHaveBeenCalledWith(senderSid, 'MALICIOUS');
        });
    });

    describe('handleVaultRenew', () => {
        it('should renew if sender is owner', async () => {
            const entry = { payloadHash: 'h1', senderSid: senderSid };
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(entry as never);
            vi.mocked(vouches.computeScore).mockReturnValue(50);

            await vaultHandlers.handleVaultRenew(senderSid, { payloadHash: 'h1', newExpiresAt: Date.now() + 1000 });

            expect(vaultDb.renewVaultEntry).toHaveBeenCalled();
        });

        it('should renew if sender is trusted custodian (score >= 65)', async () => {
            const entry = { payloadHash: 'h1', senderSid: 'other-owner' };
            vi.mocked(vaultDb.getVaultEntryByHash).mockResolvedValue(entry as never);
            vi.mocked(vouches.computeScore).mockReturnValue(70);

            await vaultHandlers.handleVaultRenew(senderSid, { payloadHash: 'h1', newExpiresAt: Date.now() + 1000 });

            expect(vaultDb.renewVaultEntry).toHaveBeenCalled();
        });
    });
});
