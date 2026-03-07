/**
 * Adaptive Proof-of-Work for Sybil resistance
 * Mobile-friendly with adjustable difficulty based on device capabilities or reputation
 */

import crypto from 'node:crypto';

export interface PowChallenge {
    difficulty: number;      // Number of leading zero bits required
    timestamp: number;       // Challenge issuance time
    data: string;           // Additional data (e.g., revelnestId)
    nonce?: string;         // Solution nonce
}

export interface PowSolution {
    nonce: string;
    difficulty: number;
    timestamp: number;
}

export class AdaptivePow {
    // Difficulty levels
    static readonly DIFFICULTY_LOW = 12;     // Mobile devices, low-power
    static readonly DIFFICULTY_MEDIUM = 16;  // Standard desktop
    static readonly DIFFICULTY_HIGH = 20;    // High-security scenarios
    
    // Time window for challenge validity (milliseconds)
    static readonly CHALLENGE_VALIDITY = 300000; // 5 minutes
    
    /**
     * Generate a new PoW challenge
     * @param revelnestId The ID of the requester (to prevent precomputation)
     * @param difficultyOverride Optional custom difficulty
     */
    static generateChallenge(revelnestId: string, difficultyOverride?: number): PowChallenge {
        const difficulty = difficultyOverride || this.DIFFICULTY_MEDIUM;
        return {
            difficulty,
            timestamp: Date.now(),
            data: revelnestId
        };
    }
    
    /**
     * Solve a PoW challenge (client-side)
     * @param challenge The challenge to solve
     * @returns Solution with nonce
     */
    static solveChallenge(challenge: PowChallenge): PowSolution | null {
        const { difficulty, timestamp, data } = challenge;
        const target = BigInt(1) << BigInt(256 - difficulty);
        
        let nonce = 0;
        const maxAttempts = 1000000; // Safety limit
        
        while (nonce < maxAttempts) {
            const hash = crypto.createHash('sha256')
                .update(data + timestamp.toString() + nonce.toString())
                .digest();
            
            const hashValue = BigInt('0x' + hash.toString('hex'));
            
            if (hashValue < target) {
                return {
                    nonce: nonce.toString(),
                    difficulty,
                    timestamp
                };
            }
            
            nonce++;
        }
        
        return null; // Could not find solution within limit
    }
    
    /**
     * Verify a PoW solution
     * @param solution The solution to verify
     * @param revelnestId Expected revelnestId
     * @returns true if valid
     */
    static verifySolution(solution: PowSolution, revelnestId: string): boolean {
        const { nonce, difficulty, timestamp } = solution;
        
        // Check timestamp freshness
        if (Date.now() - timestamp > this.CHALLENGE_VALIDITY) {
            return false; // Challenge expired
        }
        
        // Verify difficulty meets minimum
        if (difficulty < this.DIFFICULTY_LOW) {
            return false; // Difficulty too low
        }
        
        const target = BigInt(1) << BigInt(256 - difficulty);
        
        const hash = crypto.createHash('sha256')
            .update(revelnestId + timestamp.toString() + nonce)
            .digest();
        
        const hashValue = BigInt('0x' + hash.toString('hex'));
        
        return hashValue < target;
    }
    
    /**
     * Adjust difficulty based on device type or reputation
     * @param deviceType 'mobile', 'desktop', or 'server'
     * @param reputationScore 0.0 to 1.0 (higher = more trusted)
     */
    static adjustDifficulty(deviceType: string, reputationScore: number = 0.5): number {
        let baseDifficulty: number;
        
        switch (deviceType) {
            case 'mobile':
                baseDifficulty = this.DIFFICULTY_LOW;
                break;
            case 'desktop':
                baseDifficulty = this.DIFFICULTY_MEDIUM;
                break;
            case 'server':
                baseDifficulty = this.DIFFICULTY_HIGH;
                break;
            default:
                baseDifficulty = this.DIFFICULTY_MEDIUM;
        }
        
        // Adjust based on reputation: higher reputation = lower difficulty
        // Scale from 0.5x to 1.5x of base difficulty
        const reputationFactor = 1.5 - reputationScore; // 1.5 to 0.5
        const adjusted = Math.floor(baseDifficulty * reputationFactor);
        
        // Clamp to valid range
        return Math.max(this.DIFFICULTY_LOW, Math.min(this.DIFFICULTY_HIGH, adjusted));
    }
    
    /**
     * Quick verification for rate-limited endpoints
     * Simpler than full PoW, just checks that some work was done
     */
    static verifyLightProof(proof: string, revelnestId: string): boolean {
        // Light proof: just verify it's a valid hex string of reasonable length
        if (!proof || typeof proof !== 'string') return false;
        if (!/^[0-9a-f]+$/i.test(proof)) return false;
        if (proof.length > 64) return false;
        
        // Optional: do a single hash verification
        const hash = crypto.createHash('sha256')
            .update(revelnestId + proof)
            .digest('hex');
        
        // Require at least 1 leading zero hex digit (4 bits)
        return hash.startsWith('0');
    }
    
    /**
     * Generate a light proof (for mobile devices)
     */
    static generateLightProof(revelnestId: string): string {
        let nonce = 0;
        const maxAttempts = 100000; // Increased for reliability
        
        while (nonce < maxAttempts) {
            const proof = nonce.toString(16);
            const hash = crypto.createHash('sha256')
                .update(revelnestId + proof)
                .digest('hex');
            
            if (hash.startsWith('0')) {
                return proof;
            }
            
            nonce++;
        }
        
        // Fallback: simple timestamp-based proof
        return Date.now().toString(16);
    }
}