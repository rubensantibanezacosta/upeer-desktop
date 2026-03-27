import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    getContacts: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
}));

import { issueVouch, saveIncomingVouch } from '../../../src/main_process/security/reputation/vouches.js';
import { VouchType, computeVouchId, type ReputationVouch, type StoredVouch } from '../../../src/main_process/security/reputation/vouches-pure.js';
import * as storage from '../../../src/main_process/storage/reputation/operations.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as identity from '../../../src/main_process/security/identity.js';

type LooseStoredVouch = Omit<StoredVouch, 'type'> & { type: string };
type LooseIncomingVouch = Omit<ReputationVouch, 'type'> & { type: string };

function buildIncomingVouch(overrides: Partial<LooseIncomingVouch> = {}): ReputationVouch {
    const fromId = overrides.fromId ?? 'sender';
    const toId = overrides.toId ?? 'target';
    const type = (overrides.type as VouchType | undefined) ?? VouchType.HANDSHAKE;
    const timestamp = overrides.timestamp ?? Date.now();

    return {
        id: overrides.id ?? computeVouchId(fromId, toId, type, timestamp),
        fromId,
        toId,
        type,
        positive: overrides.positive ?? true,
        timestamp,
        signature: overrides.signature ?? 'sig',
    };
}

function toIncomingVouch(vouch: LooseIncomingVouch): ReputationVouch {
    return {
        ...vouch,
        type: vouch.type as ReputationVouch['type'],
    };
}

function toStoredVouches(vouches: LooseStoredVouch[]): StoredVouch[] {
    return vouches.map((vouch) => ({
        ...vouch,
        type: vouch.type as StoredVouch['type'],
    }));
}

describe('Reputation - Vouches Integration', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should issue a valid vouch', async () => {
        const mockMyId = 'my-peer-id';
        const targetId = 'target-peer-id';

        vi.mocked(identity.getMyUPeerId).mockReturnValue(mockMyId);
        vi.mocked(storage.vouchExists).mockReturnValue(false);
        vi.mocked(identity.sign).mockReturnValue(Buffer.from('signature'));

        const vouch = await issueVouch(targetId, VouchType.HANDSHAKE);

        expect(vouch).not.toBeNull();
        expect(vouch?.fromId).toBe(mockMyId);
        expect(vouch?.toId).toBe(targetId);
        expect(vouch?.signature).toBe(Buffer.from('signature').toString('hex'));
        expect(storage.insertVouch).toHaveBeenCalled();
    });

    it('should reject incoming vouch with invalid signature', async () => {
        const fakeVouch = buildIncomingVouch({
            type: VouchType.INTEGRITY_FAIL,
            signature: 'deadbeef',
        });

        vi.mocked(storage.vouchExists).mockReturnValue(false);
        vi.mocked(storage.countRecentVouchesByFrom).mockReturnValue(0);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pubkey' });
        vi.mocked(identity.verify).mockReturnValue(false);

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });

    it('should reject incoming vouch from unknown contact', async () => {
        const fakeVouch = buildIncomingVouch({ fromId: 'unknown' });

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });

    it('should respect rate limits for incoming vouches', async () => {
        const fakeVouch = buildIncomingVouch();

        vi.mocked(storage.countRecentVouchesByFrom).mockReturnValue(100);

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });
    describe('saveIncomingVouch - edge cases', () => {
        it('should return true if vouch already exists', async () => {
            vi.mocked(storage.vouchExists).mockReturnValue(true);
            const result = await saveIncomingVouch(toIncomingVouch({
                id: 'exists',
                fromId: 'sender',
                toId: 'target',
                type: VouchType.HANDSHAKE,
                positive: true,
                timestamp: Date.now(),
                signature: 'sig',
            }));
            expect(result).toBe(true);
        });

        it('should fail if required fields are missing', async () => {
            vi.mocked(storage.vouchExists).mockReturnValue(false);
            const result = await saveIncomingVouch({ fromId: 'f' } as ReputationVouch);
            expect(result).toBe(false);
        });

        it('should fail if type is invalid', async () => {
            vi.mocked(storage.vouchExists).mockReturnValue(false);
            const result = await saveIncomingVouch(toIncomingVouch({
                id: 'id', fromId: 'f', toId: 't', type: 'INVALID', signature: 's'
            } as LooseIncomingVouch));
            expect(result).toBe(false);
        });

        it('should fail if ID is mismatch', async () => {
            vi.mocked(storage.vouchExists).mockReturnValue(false);
            const result = await saveIncomingVouch(toIncomingVouch({
                id: 'wrong-id', fromId: 'f', toId: 't', type: VouchType.HANDSHAKE, signature: 's', timestamp: 1000
            }));
            expect(result).toBe(false);
        });

        it('should fail if timestamp is in the future', async () => {
            vi.mocked(storage.vouchExists).mockReturnValue(false);
            const now = Date.now();
            const futureTs = now + 10 * 60 * 1000;
            const id = computeVouchId('f', 't', VouchType.HANDSHAKE, futureTs);

            const result = await saveIncomingVouch(toIncomingVouch({
                id, fromId: 'f', toId: 't', type: VouchType.HANDSHAKE, signature: 's', timestamp: futureTs
            }));
            expect(result).toBe(false);
        });

        it('should fail if timestamp is too old', async () => {
            vi.mocked(storage.vouchExists).mockReturnValue(false);
            const tooOldTs = Date.now() - (40 * 24 * 60 * 60 * 1000);
            const id = computeVouchId('f', 't', VouchType.HANDSHAKE, tooOldTs);

            const result = await saveIncomingVouch(toIncomingVouch({
                id, fromId: 'f', toId: 't', type: VouchType.HANDSHAKE, signature: 's', timestamp: tooOldTs
            }));
            expect(result).toBe(false);
        });

        it('should log error and return false if exception occurs', async () => {
            vi.mocked(storage.vouchExists).mockImplementation(() => { throw new Error('DB Error'); });
            const result = await saveIncomingVouch({ id: 'sample-id' } as ReputationVouch);
            expect(result).toBe(false);
        });
    });

    describe('computeScore and helpers', () => {
        it('should return 50 if computeScore fails', async () => {
            const { computeScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            vi.mocked(storage.getVouchesForNode).mockImplementation(() => { throw new Error('DB Error'); });
            const score = computeScore('target', new Set());
            expect(score).toBe(50);
        });

        it('should return 50 if getVouchScore fails', async () => {
            const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            vi.mocked(contactsOps.getContacts).mockImplementation(() => { throw new Error('DB Error'); });
            const score = await getVouchScore('target');
            expect(score).toBe(50);
        });

        it('should get score with direct contacts from DB', async () => {
            const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            vi.mocked(contactsOps.getContacts).mockResolvedValue([
                { upeerId: 'peer1', status: 'connected' },
                { upeerId: 'peer2', status: 'pending' },
            ]);
            vi.mocked(storage.getVouchesForNode).mockReturnValue(toStoredVouches([
                { id: 'v1', fromId: 'peer1', toId: 'target', type: VouchType.HANDSHAKE, positive: true, timestamp: 1, signature: 'sig', receivedAt: 1 },
                { id: 'v2', fromId: 'peer2', toId: 'target', type: VouchType.HANDSHAKE, positive: true, timestamp: 2, signature: 'sig', receivedAt: 2 },
                { id: 'v3', fromId: 'unknown', toId: 'target', type: VouchType.HANDSHAKE, positive: true, timestamp: 3, signature: 'sig', receivedAt: 3 },
            ]));
            const score = await getVouchScore('target');
            expect(score).toBe(51);
        });

        it('should cap score between 0 and 100', async () => {
            const { computeScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            const manyVouches = toStoredVouches(Array.from({ length: 20 }, (_, index) => ({
                id: `v-${index}`,
                fromId: 'p1',
                toId: 't',
                type: VouchType.VAULT_CHUNK,
                positive: true,
                timestamp: index,
                signature: 'sig',
                receivedAt: index,
            })));
            vi.mocked(storage.getVouchesForNode).mockReturnValue(manyVouches);

            const score = computeScore('t', new Set(['p1']));
            expect(score).toBe(80);

            const negativeVouches = toStoredVouches(Array.from({ length: 20 }, (_, index) => ({
                id: `n-${index}`,
                fromId: 'p1',
                toId: 't',
                type: VouchType.INTEGRITY_FAIL,
                positive: false,
                timestamp: index,
                signature: 'sig',
                receivedAt: index,
            })));
            vi.mocked(storage.getVouchesForNode).mockReturnValue(negativeVouches);
            const lowScore = computeScore('t', new Set(['p1']));
            expect(lowScore).toBe(0);
        });

        it('should return gossip IDs and delivery vouches', async () => {
            const { getGossipIds, getVouchesForDelivery } = await import('../../../src/main_process/security/reputation/vouches.js');
            const mockIds = ['id1', 'id2'];
            vi.mocked(storage.getVouchIds).mockReturnValue(mockIds);
            vi.mocked(storage.getVouchesByIds).mockReturnValue([{ id: 'v1' }] as ReturnType<typeof storage.getVouchesByIds>);

            expect(getGossipIds()).toEqual(mockIds);
            expect(getVouchesForDelivery(['id1'])).toEqual([{ id: 'v1' }]);
        });
    });

    describe('issueVouch - edge cases', () => {
        it('should return null if fromId is missing', async () => {
            vi.mocked(identity.getMyUPeerId).mockReturnValue(null);
            const result = await issueVouch('target', VouchType.HANDSHAKE);
            expect(result).toBeNull();
        });

        it('should return null if vouch already exists', async () => {
            vi.mocked(identity.getMyUPeerId).mockReturnValue('me');
            vi.mocked(storage.vouchExists).mockReturnValue(true);
            const result = await issueVouch('target', VouchType.HANDSHAKE);
            expect(result).toBeNull();
        });

        it('should return null if exception occurs', async () => {
            vi.mocked(identity.getMyUPeerId).mockImplementation(() => { throw new Error('Err'); });
            const result = await issueVouch('target', VouchType.HANDSHAKE);
            expect(result).toBeNull();
        });
    });
});
