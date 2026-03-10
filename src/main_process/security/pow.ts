/**
 * Adaptive Proof-of-Work for Sybil resistance
 * Mobile-friendly with adjustable difficulty based on device capabilities or reputation
 *
 * PoW scheme: Argon2id (memory-hard) — replaces SHA-256 to defeat GPU/ASIC botnets.
 * Each proof requires ~8 MB of RAM per attempt, making GPU parallelism ineffective.
 * Proof format: JSON string { s: saltHex, t: timestampSeconds }
 */

import sodium from 'sodium-native';
import crypto from 'node:crypto';

// ── Argon2id parameters ──────────────────────────────────────────────────────
// OPSLIMIT_MIN (1 pass) + MEMLIMIT_MIN (8 MiB) → ~20-50 ms on a modern CPU.
// Difficulty: first 4 bits of hash must be zero → 1/16 probability → ~16 attempts
// Expected total time: ~400-800 ms on CPU; GPU clusters are memory-bound.
const ARGON2_OPSLIMIT = sodium.crypto_pwhash_OPSLIMIT_MIN;   // 1
const ARGON2_MEMLIMIT = sodium.crypto_pwhash_MEMLIMIT_MIN;   // 8 MiB
const ARGON2_ALG = sodium.crypto_pwhash_ALG_ARGON2ID13;
const DIFFICULTY_MASK = 0xF0; // top nibble == 0 → 4 leading zero bits (1/16 chance)
const PROOF_VALIDITY_S = 300; // 5 minutes

export class AdaptivePow {
    /**
     * Generate a memory-hard Argon2id light proof.
     * Proof format: JSON string { s: saltHex, t: timestampSeconds }
     *
     * Each attempt allocates 8 MiB — GPU botnets are memory-bus limited.
     * Expected: ~16 attempts × ~30 ms/attempt = ~480 ms on desktop CPU.
     */
    static generateLightProof(upeerId: string): string {
        const t = Math.floor(Date.now() / 1000);
        const password = Buffer.from(upeerId + t.toString());
        const hash = Buffer.alloc(32);
        const salt = Buffer.allocUnsafe(sodium.crypto_pwhash_SALTBYTES);
        const MAX_ATTEMPTS = 512;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            sodium.randombytes_buf(salt);
            sodium.crypto_pwhash(hash, password, salt, ARGON2_OPSLIMIT, ARGON2_MEMLIMIT, ARGON2_ALG);

            // Difficulty: top nibble of first byte must be 0 (4 leading zero bits → 1/16)
            if ((hash[0] & DIFFICULTY_MASK) === 0) {
                return JSON.stringify({ s: salt.toString('hex'), t });
            }
        }

        // Should statistically never happen (512 >> 16 expected attempts)
        // Return last attempt — verifier will reject, contact simply won't connect
        return JSON.stringify({ s: salt.toString('hex'), t });
    }

    /**
     * Verify a light proof. Supports both the new Argon2id format (JSON) and
     * the legacy SHA-256 format (plain hex) for backward compatibility.
     */
    static verifyLightProof(proof: string, upeerId: string): boolean {
        if (!proof || typeof proof !== 'string') return false;

        // ── New Argon2id format ─────────────────────────────────────────────
        if (proof.startsWith('{')) {
            try {
                const { s: saltHex, t } = JSON.parse(proof);
                if (typeof saltHex !== 'string' || typeof t !== 'number') return false;

                // Timestamp freshness (±5 min)
                if (Math.abs(Date.now() / 1000 - t) > PROOF_VALIDITY_S) return false;

                const salt = Buffer.from(saltHex, 'hex');
                if (salt.length !== sodium.crypto_pwhash_SALTBYTES) return false;

                const password = Buffer.from(upeerId + t.toString());
                const hash = Buffer.alloc(32);
                sodium.crypto_pwhash(hash, password, salt, ARGON2_OPSLIMIT, ARGON2_MEMLIMIT, ARGON2_ALG);

                return (hash[0] & DIFFICULTY_MASK) === 0;
            } catch {
                return false;
            }
        }

        // ── Legacy SHA-256 format (backward compat, remove after all peers upgrade) ──
        if (!/^[0-9a-f]+$/i.test(proof) || proof.length > 64) return false;
        const hash = crypto.createHash('sha256').update(upeerId + proof).digest('hex');
        return hash.startsWith('0');
    }
}