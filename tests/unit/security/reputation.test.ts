import { describe, it, expect } from 'vitest';
import {
    VouchType,
    computeVouchId,
    VOUCH_WEIGHTS,
    VOUCH_POSITIVE,
    computeScorePure,
    type StoredVouch,
} from '../../../src/main_process/security/reputation/vouches-pure.js';

type LooseStoredVouch = Omit<StoredVouch, 'type'> & { type: string };

function toStoredVouches(vouches: LooseStoredVouch[]): StoredVouch[] {
    return vouches as unknown as StoredVouch[];
}

describe('Reputation - Vouches Pure Logic', () => {

    it('should generate deterministic IDs for same inputs', () => {
        const from = 'sender-id';
        const to = 'target-id';
        const type = VouchType.HANDSHAKE;
        const ts = 1700000000000;

        const id1 = computeVouchId(from, to, type, ts);
        const id2 = computeVouchId(from, to, type, ts);

        expect(id1).toBe(id2);
        expect(id1.length).toBe(64);
    });

    it('should calculate score correctly based on direct contacts only', () => {
        const directContacts = new Set(['friend-1', 'friend-2']);
        const vouches = toStoredVouches([
            { id: 'v1', fromId: 'friend-1', toId: 'target-id', type: VouchType.HANDSHAKE, positive: true, timestamp: 1, signature: 'sig', receivedAt: 1 },
            { id: 'v2', fromId: 'friend-2', toId: 'target-id', type: VouchType.VAULT_HELPED, positive: true, timestamp: 2, signature: 'sig', receivedAt: 2 },
            { id: 'v3', fromId: 'stranger', toId: 'target-id', type: VouchType.HANDSHAKE, positive: true, timestamp: 3, signature: 'sig', receivedAt: 3 },
        ]);

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(53);
    });

    it('should respect MAX_CONTRIBUTING_VOUCHES_PER_SENDER', () => {
        const directContacts = new Set(['friend-1']);
        const vouches: LooseStoredVouch[] = [];
        for (let i = 0; i < 15; i++) {
            vouches.push({ id: `v-${i}`, fromId: 'friend-1', toId: 'target-id', type: VouchType.HANDSHAKE, positive: true, timestamp: i, signature: 'sig', receivedAt: i });
        }

        const score = computeScorePure(toStoredVouches(vouches), directContacts);
        expect(score).toBe(60);
    });

    it('should calculate score correctly with negative weights', () => {
        const directContacts = new Set(['friend-1']);
        const vouches = toStoredVouches([
            { id: 'v1', fromId: 'friend-1', toId: 'target-id', type: VouchType.SPAM, positive: false, timestamp: 1, signature: 'sig', receivedAt: 1 },
        ]);

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(45);
    });

    it('should stay within 0-100 bounds', () => {
        const directContacts = new Set(['friend-1']);
        const vouches: LooseStoredVouch[] = [];
        for (let i = 0; i < 10; i++) {
            vouches.push({ id: `v-${i}`, fromId: 'friend-1', toId: 'target-id', type: VouchType.INTEGRITY_FAIL, positive: false, timestamp: i, signature: 'sig', receivedAt: i });
        }

        const score = computeScorePure(toStoredVouches(vouches), directContacts);
        expect(score).toBe(0);
    });

    it('should test floating point precision in score delta', () => {
        const directContacts = new Set(['friend-1', 'friend-2']);
        const vouches = toStoredVouches([
            { id: 'v1', fromId: 'friend-1', toId: 'target-id', type: VouchType.VAULT_RETRIEVED, positive: true, timestamp: 1, signature: 'sig', receivedAt: 1 },
            { id: 'v2', fromId: 'friend-2', toId: 'target-id', type: VouchType.VAULT_RETRIEVED, positive: true, timestamp: 2, signature: 'sig', receivedAt: 2 },
        ]);

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(53);
    });

    it('should handle vouch types with zero or missing weights (default to 1.0)', () => {
        const directContacts = new Set(['friend-1']);
        const vouches = toStoredVouches([
            { id: 'v1', fromId: 'friend-1', toId: 'target-id', type: 'UNKNOWN_TYPE', positive: true, timestamp: 1, signature: 'sig', receivedAt: 1 },
        ]);

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(51);
    });

    it('should generate different IDs for different timestamps', () => {
        const from = 'sender-id';
        const to = 'target-id';
        const type = VouchType.HANDSHAKE;

        const id1 = computeVouchId(from, to, type, 1000);
        const id2 = computeVouchId(from, to, type, 2000);

        expect(id1).not.toBe(id2);
    });

    it('should have correct polarities for vouch types', () => {
        expect(VOUCH_POSITIVE[VouchType.HANDSHAKE]).toBe(true);
        expect(VOUCH_POSITIVE[VouchType.VAULT_HELPED]).toBe(true);
        expect(VOUCH_POSITIVE[VouchType.SPAM]).toBe(false);
        expect(VOUCH_POSITIVE[VouchType.MALICIOUS]).toBe(false);
        expect(VOUCH_POSITIVE[VouchType.INTEGRITY_FAIL]).toBe(false);
    });

    it('should handle higher negative weights for integrity fails than spam', () => {
        const spamWeight = VOUCH_WEIGHTS[VouchType.SPAM];
        const integrityWeight = VOUCH_WEIGHTS[VouchType.INTEGRITY_FAIL];

        expect(integrityWeight).toBeGreaterThan(spamWeight);
    });

    it('should return 50 if no vouches are provided', () => {
        const score = computeScorePure([], new Set());
        expect(score).toBe(50);
    });

    it('should ignore vouches with unknown types and default to 1.0', () => {
        const directContacts = new Set(['friend-1']);
        const vouches = toStoredVouches([
            { id: 'v1', fromId: 'friend-1', toId: 'target-id', type: 'ALIEN_ATTACK', positive: true, timestamp: 100, signature: 'sig', receivedAt: 100 },
        ];
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(51);
    });

    it('should handle multiple senders within limits', () => {
        const directContacts = new Set(['peer-A', 'peer-B']);
        const vouches = toStoredVouches([
            { id: 'v1', fromId: 'peer-A', toId: 'target-id', type: VouchType.VAULT_CHUNK, positive: true, timestamp: 1, signature: 'sig', receivedAt: 1 },
            { id: 'v2', fromId: 'peer-B', toId: 'target-id', type: VouchType.SPAM, positive: false, timestamp: 2, signature: 'sig', receivedAt: 2 },
        ]);
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(48);
    });

    it('should not allow score to drop below 0 even with extreme malicious activity', () => {
        const directContacts = new Set(['peer-A']);
        const vouches = toStoredVouches(Array.from({ length: 20 }, (_, i) => ({
            id: `v-${i}`,
            fromId: 'peer-A',
            toId: 'target-id',
            type: VouchType.INTEGRITY_FAIL,
            positive: false,
            timestamp: i,
            signature: 'sig',
            receivedAt: i,
        })));
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(0);
    });
});
