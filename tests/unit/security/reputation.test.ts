import { describe, it, expect } from 'vitest';
import {
    VouchType,
    computeVouchId,
    VOUCH_WEIGHTS,
    VOUCH_POSITIVE,
    computeScorePure
} from '../../../src/main_process/security/reputation/vouches-pure.js';

describe('Reputation - Vouches Pure Logic', () => {

    it('should generate deterministic IDs for same inputs', () => {
        const from = 'sender-id';
        const to = 'target-id';
        const type = VouchType.HANDSHAKE;
        const ts = 1700000000000;

        const id1 = computeVouchId(from, to, type, ts);
        const id2 = computeVouchId(from, to, type, ts);

        expect(id1).toBe(id2);
        expect(id1.length).toBe(64); // SHA256 hex
    });

    it('should calculate score correctly based on direct contacts only', () => {
        const directContacts = new Set(['friend-1', 'friend-2']);
        const vouches: any[] = [
            { fromId: 'friend-1', type: VouchType.HANDSHAKE, positive: true }, // +1
            { fromId: 'friend-2', type: VouchType.VAULT_HELPED, positive: true }, // +2
            { fromId: 'stranger', type: VouchType.HANDSHAKE, positive: true }, // Ignored
        ];

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(50 + 1 + 2); // 53
    });

    it('should respect MAX_CONTRIBUTING_VOUCHES_PER_SENDER', () => {
        const directContacts = new Set(['friend-1']);
        const vouches: any[] = [];
        // Añadir 15 vouches de handshake (+1 cada uno)
        for (let i = 0; i < 15; i++) {
            vouches.push({ fromId: 'friend-1', type: VouchType.HANDSHAKE, positive: true, timestamp: i });
        }

        const score = computeScorePure(vouches, directContacts);
        // Debería sumar solo 10 (límite por emisor)
        expect(score).toBe(50 + 10);
    });

    it('should calculate score correctly with negative weights', () => {
        const directContacts = new Set(['friend-1']);
        const vouches: any[] = [
            { fromId: 'friend-1', type: VouchType.SPAM, positive: false }, // -5 (según constantes)
        ];

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(50 - 5);
    });

    it('should stay within 0-100 bounds', () => {
        const directContacts = new Set(['friend-1']);
        const vouches: any[] = [];
        // Añadir muchos fallos de integridad (-15 cada uno)
        for (let i = 0; i < 10; i++) {
            vouches.push({ fromId: 'friend-1', type: VouchType.INTEGRITY_FAIL, positive: false, timestamp: i });
        }

        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(0); // No 50 - 150 = -100
    });

    it('should test floating point precision in score delta', () => {
        const directContacts = new Set(['friend-1', 'friend-2']);
        const vouches: any[] = [
            { fromId: 'friend-1', type: VouchType.VAULT_RETRIEVED, positive: true }, // +1.5
            { fromId: 'friend-2', type: VouchType.VAULT_RETRIEVED, positive: true }, // +1.5
        ];
        // Total delta = 3.0
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(53);
    });

    it('should handle vouch types with zero or missing weights (default to 1.0)', () => {
        const directContacts = new Set(['friend-1']);
        const vouches: any[] = [
            { fromId: 'friend-1', type: 'UNKNOWN_TYPE', positive: true }, // Should use 1.0 default
        ];
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
        const vouches: any[] = [
            { fromId: 'friend-1', type: 'ALIEN_ATTACK', positive: true, timestamp: 100 }
        ];
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(51); // 50 + 1.0 (default)
    });

    it('should handle multiple senders within limits', () => {
        const directContacts = new Set(['peer-A', 'peer-B']);
        const vouches: any[] = [
            { fromId: 'peer-A', type: VouchType.VAULT_CHUNK, positive: true, timestamp: 1 }, // +3
            { fromId: 'peer-B', type: VouchType.SPAM, positive: false, timestamp: 2 },        // -5
        ];
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(48); // 50 + 3 - 5
    });

    it('should not allow score to drop below 0 even with extreme malicious activity', () => {
        const directContacts = new Set(['peer-A']);
        const vouches: any[] = Array.from({ length: 20 }, (_, i) => ({
            fromId: 'peer-A',
            type: VouchType.INTEGRITY_FAIL,
            positive: false,
            timestamp: i
        }));
        const score = computeScorePure(vouches, directContacts);
        expect(score).toBe(0);
    });
});
