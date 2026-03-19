import { describe, it, expect, vi, beforeEach } from 'vitest';

// Step 1: Mock the modules
vi.mock('../../../src/main_process/storage/reputation/operations.js', () => ({
    insertVouch: vi.fn(),
    vouchExists: vi.fn(),
    countRecentVouchesByFrom: vi.fn(),
    getVouchIds: vi.fn(),
    getVouchesByIds: vi.fn(),
    getVouchesForNode: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
}));

// Step 2: Import everything
import { issueVouch, saveIncomingVouch } from '../../../src/main_process/security/reputation/vouches.js';
import { VouchType } from '../../../src/main_process/security/reputation/vouches-pure.js';
import * as storage from '../../../src/main_process/storage/reputation/operations.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as identity from '../../../src/main_process/security/identity.js';

describe('Reputation - Vouches Integration', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should issue a valid vouch', async () => {
        const mockMyId = 'my-peer-id';
        const targetId = 'target-peer-id';

        (identity.getMyUPeerId as any).mockReturnValue(mockMyId);
        (storage.vouchExists as any).mockReturnValue(false);
        (identity.sign as any).mockReturnValue(Buffer.from('signature'));

        const vouch = await issueVouch(targetId, VouchType.HANDSHAKE);

        expect(vouch).not.toBeNull();
        expect(vouch?.fromId).toBe(mockMyId);
        expect(vouch?.toId).toBe(targetId);
        expect(vouch?.signature).toBe(Buffer.from('signature').toString('hex'));
        expect(storage.insertVouch).toHaveBeenCalled();
    });

    it('should reject incoming vouch with invalid signature', async () => {
        const fakeVouch: any = {
            id: 'valid-id',
            fromId: 'sender',
            toId: 'target',
            type: VouchType.INTEGRITY_FAIL,
            timestamp: Date.now(),
            signature: 'deadbeef'
        };

        // Ensure ID is correct so it doesn't fail at ID check
        const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
        fakeVouch.id = computeVouchId(fakeVouch.fromId, fakeVouch.toId, fakeVouch.type, fakeVouch.timestamp);

        (storage.vouchExists as any).mockReturnValue(false);
        (storage.countRecentVouchesByFrom as any).mockReturnValue(0);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pubkey' });
        (identity.verify as any).mockReturnValue(false); // Invalid signature

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });

    it('should reject incoming vouch from unknown contact', async () => {
        const fakeVouch: any = {
            id: 'id',
            fromId: 'unknown',
            toId: 'target',
            type: VouchType.HANDSHAKE,
            timestamp: Date.now(),
            signature: 'sig'
        };
        const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
        fakeVouch.id = computeVouchId(fakeVouch.fromId, fakeVouch.toId, fakeVouch.type, fakeVouch.timestamp);

        (contactsOps.getContactByUpeerId as any).mockResolvedValue(null);

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });

    it('should respect rate limits for incoming vouches', async () => {
        const fakeVouch: any = {
            id: 'id',
            fromId: 'sender',
            toId: 'target',
            type: VouchType.HANDSHAKE,
            timestamp: Date.now(),
            signature: 'sig'
        };
        const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
        fakeVouch.id = computeVouchId(fakeVouch.fromId, fakeVouch.toId, fakeVouch.type, fakeVouch.timestamp);

        (storage.countRecentVouchesByFrom as any).mockReturnValue(100); // Over limit

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });
    describe('saveIncomingVouch - edge cases', () => {
        it('should return true if vouch already exists', async () => {
            (storage.vouchExists as any).mockReturnValue(true);
            const result = await saveIncomingVouch({ id: 'exists' } as any);
            expect(result).toBe(true);
        });

        it('should fail if required fields are missing', async () => {
            (storage.vouchExists as any).mockReturnValue(false);
            const result = await saveIncomingVouch({ fromId: 'f' } as any);
            expect(result).toBe(false);
        });

        it('should fail if type is invalid', async () => {
            (storage.vouchExists as any).mockReturnValue(false);
            const result = await saveIncomingVouch({
                id: 'id', fromId: 'f', toId: 't', type: 'INVALID', signature: 's'
            } as any);
            expect(result).toBe(false);
        });

        it('should fail if ID is mismatch', async () => {
            (storage.vouchExists as any).mockReturnValue(false);
            const result = await saveIncomingVouch({
                id: 'wrong-id', fromId: 'f', toId: 't', type: VouchType.HANDSHAKE, signature: 's', timestamp: 1000
            } as any);
            expect(result).toBe(false);
        });

        it('should fail if timestamp is in the future', async () => {
            (storage.vouchExists as any).mockReturnValue(false);
            const now = Date.now();
            const futureTs = now + 10 * 60 * 1000; // 10 mins future
            const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
            const id = computeVouchId('f', 't', VouchType.HANDSHAKE, futureTs);

            const result = await saveIncomingVouch({
                id, fromId: 'f', toId: 't', type: VouchType.HANDSHAKE, signature: 's', timestamp: futureTs
            } as any);
            expect(result).toBe(false);
        });

        it('should fail if timestamp is too old', async () => {
            (storage.vouchExists as any).mockReturnValue(false);
            const tooOldTs = Date.now() - (40 * 24 * 60 * 60 * 1000); // 40 days old
            const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
            const id = computeVouchId('f', 't', VouchType.HANDSHAKE, tooOldTs);

            const result = await saveIncomingVouch({
                id, fromId: 'f', toId: 't', type: VouchType.HANDSHAKE, signature: 's', timestamp: tooOldTs
            } as any);
            expect(result).toBe(false);
        });

        it('should log error and return false if exception occurs', async () => {
            (storage.vouchExists as any).mockImplementation(() => { throw new Error('DB Error'); });
            const result = await saveIncomingVouch({ id: 'any' } as any);
            expect(result).toBe(false);
        });
    });

    describe('computeScore and helpers', () => {
        it('should return 50 if computeScore fails', async () => {
            const { computeScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            (storage.getVouchesForNode as any).mockImplementation(() => { throw new Error('DB Error'); });
            const score = computeScore('target', new Set());
            expect(score).toBe(50);
        });

        it('should return 50 if getVouchScore fails', async () => {
            const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            (contactsOps as any).getContacts = vi.fn().mockImplementation(() => { throw new Error('DB Error'); });
            const score = await getVouchScore('target');
            expect(score).toBe(50);
        });

        it('should get score with direct contacts from DB', async () => {
            const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            (contactsOps as any).getContacts = vi.fn().mockReturnValue([
                { upeerId: 'peer1', status: 'connected' },
                { upeerId: 'peer2', status: 'pending' },
            ]);
            (storage.getVouchesForNode as any).mockReturnValue([
                { fromId: 'peer1', type: VouchType.HANDSHAKE, positive: true },
                { fromId: 'peer2', type: VouchType.HANDSHAKE, positive: true }, // Should be ignored (status pending)
                { fromId: 'unknown', type: VouchType.HANDSHAKE, positive: true } // Should be ignored (not in contacts)
            ]);
            const score = await getVouchScore('target');
            // peer1: HANDSHAKE weight is 1.0. 50 + 1 = 51.
            expect(score).toBe(51);
        });

        it('should cap score between 0 and 100', async () => {
            const { computeScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            // MAX_CONTRIBUTING_VOUCHES_PER_SENDER is 10.
            const manyVouches = Array(20).fill({ fromId: 'p1', type: VouchType.VAULT_CHUNK, positive: true });
            (storage.getVouchesForNode as any).mockReturnValue(manyVouches);

            const score = computeScore('t', new Set(['p1']));
            // p1 max contributing is 10. 10 * 3.0 = 30. 50 + 30 = 80.
            expect(score).toBe(80);

            const negativeVouches = Array(20).fill({ fromId: 'p1', type: VouchType.INTEGRITY_FAIL, positive: false });
            (storage.getVouchesForNode as any).mockReturnValue(negativeVouches);
            const lowScore = computeScore('t', new Set(['p1']));
            // 10 * -15 = -150. 50 - 150 = -100 -> capped to 0.
            expect(lowScore).toBe(0);
        });

        it('should return gossip IDs and delivery vouches', async () => {
            const { getGossipIds, getVouchesForDelivery } = await import('../../../src/main_process/security/reputation/vouches.js');
            const mockIds = ['id1', 'id2'];
            (storage.getVouchIds as any).mockReturnValue(mockIds);
            (storage.getVouchesByIds as any).mockReturnValue([{ id: 'v1' }]);

            expect(getGossipIds()).toEqual(mockIds);
            expect(getVouchesForDelivery(['id1'])).toEqual([{ id: 'v1' }]);
        });
    });

    describe('issueVouch - edge cases', () => {
        it('should return null if fromId is missing', async () => {
            (identity.getMyUPeerId as any).mockReturnValue(null);
            const result = await issueVouch('target', VouchType.HANDSHAKE);
            expect(result).toBeNull();
        });

        it('should return null if vouch already exists', async () => {
            (identity.getMyUPeerId as any).mockReturnValue('me');
            (storage.vouchExists as any).mockReturnValue(true);
            const result = await issueVouch('target', VouchType.HANDSHAKE);
            expect(result).toBeNull();
        });

        it('should return null if exception occurs', async () => {
            (identity.getMyUPeerId as any).mockImplementation(() => { throw new Error('Err'); });
            const result = await issueVouch('target', VouchType.HANDSHAKE);
            expect(result).toBeNull();
        });
    });
});
