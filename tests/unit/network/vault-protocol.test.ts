import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vaultHandlers from '../../../src/main_process/network/vault/protocol/handlers.js';
import * as vaultDb from '../../../src/main_process/storage/vault/operations.js';
import * as vouches from '../../../src/main_process/security/reputation/vouches.js';

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn(),
    getVaultEntriesForRecipient: vi.fn(),
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
            const data = {
                payloadHash: 'hash1',
                recipientSid: 'recp1',
                data: '00112233',
                priority: 1,
                expiresAt: Date.now() + 1000
            };
            (vaultDb.getSenderUsage as any).mockResolvedValue(0);
            (vouches.computeScore as any).mockReturnValue(70); // Trusted tier

            await vaultHandlers.handleVaultStore(senderSid, data as any, '1.1.1.1', mockSendResponse);

            expect(vaultDb.saveVaultEntry).toHaveBeenCalledWith(
                'hash1', 'recp1', senderSid, 1, '00112233', expect.any(Number)
            );
            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({ type: 'VAULT_ACK' }));
        });

        it('should refuse if score is too low', async () => {
            (vouches.computeScore as any).mockReturnValue(20);
            await vaultHandlers.handleVaultStore(senderSid, {} as any);
            expect(vaultDb.saveVaultEntry).not.toHaveBeenCalled();
        });

        it('should refuse if quota exceeded', async () => {
            (vouches.computeScore as any).mockReturnValue(50); // 50MB quota
            (vaultDb.getSenderUsage as any).mockResolvedValue(60 * 1024 * 1024);
            await vaultHandlers.handleVaultStore(senderSid, { data: 'aa', payloadHash: 'h', recipientSid: 'r' } as any);
            expect(vaultDb.saveVaultEntry).not.toHaveBeenCalled();
        });
    });

    describe('handleVaultQuery', () => {
        it('should deliver entries for authorized requester', async () => {
            const entries = [{ payloadHash: 'h1' }, { payloadHash: 'h2' }];
            (vaultDb.getVaultEntriesForRecipient as any).mockResolvedValue(entries);

            await vaultHandlers.handleVaultQuery(senderSid, { requesterSid: senderSid, timestamp: Date.now() }, '1.1.1.1', mockSendResponse);

            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                type: 'VAULT_DELIVERY',
                entries: expect.arrayContaining([{ payloadHash: 'h1' }])
            }));
        });

        it('should refuse unauthorized query (senderSid != requesterSid)', async () => {
            await vaultHandlers.handleVaultQuery(senderSid, { requesterSid: 'other', timestamp: Date.now() }, '1.1.1.1', mockSendResponse);
            expect(mockSendResponse).not.toHaveBeenCalled();
        });

        it('should return specific entry if payloadHash requested', async () => {
            const entry = { payloadHash: 'h1', recipientSid: senderSid };
            (vaultDb.getVaultEntryByHash as any).mockResolvedValue(entry);

            await vaultHandlers.handleVaultQuery(senderSid, { requesterSid: senderSid, timestamp: Date.now(), payloadHash: 'h1' }, '1.1.1.1', mockSendResponse);

            expect(mockSendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                entries: [entry]
            }));
        });
    });

    describe('handleVaultAck', () => {
        it('should delete entries if sender is the legitimate recipient', async () => {
            const entry = { payloadHash: 'h1', recipientSid: senderSid };
            (vaultDb.getVaultEntryByHash as any).mockResolvedValue(entry);
            (vaultDb.deleteVaultEntry as any).mockResolvedValue(true);

            await vaultHandlers.handleVaultAck(senderSid, { payloadHashes: ['h1'] });

            expect(vaultDb.deleteVaultEntry).toHaveBeenCalledWith('h1');
        });

        it('should ignore and issue malicious vouch if sender is not recipient', async () => {
            const entry = { payloadHash: 'h1', recipientSid: 'other' };
            (vaultDb.getVaultEntryByHash as any).mockResolvedValue(entry);

            await vaultHandlers.handleVaultAck(senderSid, { payloadHashes: ['h1'] });

            expect(vaultDb.deleteVaultEntry).not.toHaveBeenCalled();
            expect(vouches.issueVouch).toHaveBeenCalledWith(senderSid, 'MALICIOUS');
        });
    });

    describe('handleVaultRenew', () => {
        it('should renew if sender is owner', async () => {
            const entry = { payloadHash: 'h1', senderSid: senderSid };
            (vaultDb.getVaultEntryByHash as any).mockResolvedValue(entry);
            (vouches.computeScore as any).mockReturnValue(50);

            await vaultHandlers.handleVaultRenew(senderSid, { payloadHash: 'h1', newExpiresAt: Date.now() + 1000 });

            expect(vaultDb.renewVaultEntry).toHaveBeenCalled();
        });

        it('should renew if sender is trusted custodian (score >= 65)', async () => {
            const entry = { payloadHash: 'h1', senderSid: 'other-owner' };
            (vaultDb.getVaultEntryByHash as any).mockResolvedValue(entry);
            (vouches.computeScore as any).mockReturnValue(70);

            await vaultHandlers.handleVaultRenew(senderSid, { payloadHash: 'h1', newExpiresAt: Date.now() + 1000 });

            expect(vaultDb.renewVaultEntry).toHaveBeenCalled();
        });
    });
});
