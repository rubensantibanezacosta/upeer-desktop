import { error } from '../../../security/secure-logger.js';


/**
 * Basic Galois Field GF(2^8) operations for Reed-Solomon.
 * Systematic Vandermonde-based approach.
 */
class GF256 {
    private static exp = new Uint8Array(512);
    private static log = new Uint8Array(256);
    private static initialized = false;

    private static init() {
        if (this.initialized) return;
        let x = 1;
        for (let i = 0; i < 255; i++) {
            this.exp[i] = x;
            this.log[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
        }
        for (let i = 0; i < 255; i++) {
            this.exp[i + 255] = this.exp[i];
        }
        this.initialized = true;
    }

    static mul(a: number, b: number): number {
        this.init();
        if (a === 0 || b === 0) return 0;
        return this.exp[this.log[a] + this.log[b]];
    }

    static div(a: number, b: number): number {
        this.init();
        if (a === 0) return 0;
        if (b === 0) throw new Error("GF256: division by zero");
        return this.exp[this.log[a] + 255 - this.log[b]];
    }

    static pow(a: number, n: number): number {
        this.init();
        if (a === 0) return 0;
        return this.exp[(this.log[a] * n) % 255];
    }
}

export class ErasureCoder {
    private n: number;

    constructor(private k: number = 4, private m: number = 8) {
        this.n = k + m;
        if (this.n > 256) throw new Error("Total shards cannot exceed 256");
    }

    /**
     * Encodes a buffer into shards.
     * The original data is split into k shards, and m parity shards are created.
     */
    encode(data: Buffer): Buffer[] {
        // Padding if data is not multiple of k
        const shardSize = Math.ceil(data.length / this.k);
        const paddedData = Buffer.alloc(shardSize * this.k);
        data.copy(paddedData);

        const shards: Buffer[] = [];
        for (let i = 0; i < this.k; i++) {
            shards.push(paddedData.slice(i * shardSize, (i + 1) * shardSize));
        }

        // Generate parity shards using a Vandermonde matrix row
        for (let i = 0; i < this.m; i++) {
            const parityShard = Buffer.alloc(shardSize);
            const rowIdx = this.k + i;

            for (let j = 0; j < shardSize; j++) {
                let sum = 0;
                for (let s = 0; s < this.k; s++) {
                    // Cauchy/Vandermonde coefficient
                    const coeff = GF256.div(1, (rowIdx ^ s) || 1); // Simplified Cauchy-like
                    sum ^= GF256.mul(shards[s][j], coeff);
                }
                parityShard[j] = sum;
            }
            shards.push(parityShard);
        }

        return shards;
    }

    /**
     * Attempts to reconstruct the original data from a subset of shards.
     * Requires at least k shards to succeed.
     */
    /**
     * Attempts to reconstruct the original data from a subset of shards.
     * Requires at least k shards to succeed.
     */
    decode(shards: { index: number; data: Buffer }[], originalSize: number): Buffer | null {
        if (shards.length < this.k) {
            error("Insufficient shards for reconstruction", { expected: this.k, received: shards.length }, 'erasure');
            return null;
        }

        const shardSize = shards[0].data.length;

        // 1. Sort and pick exactly k shards
        const sortedShards = shards.sort((a, b) => a.index - b.index).slice(0, this.k);

        // 2. Build the matrix of the available shards
        const matrix: number[][] = [];
        for (const s of sortedShards) {
            const row: number[] = new Array(this.k).fill(0);
            if (s.index < this.k) {
                // Identity row for data shards
                row[s.index] = 1;
            } else {
                // Cauchy-like row for parity shards (must match encoding logic)
                for (let j = 0; j < this.k; j++) {
                    row[j] = GF256.div(1, (s.index ^ j) || 1);
                }
            }
            matrix.push(row);
        }


        // 3. Invert the matrix (Gaussian elimination)
        const inverted = this.invertMatrix(matrix);
        if (!inverted) {
            error("Failed to invert encoding matrix", {}, 'erasure');
            return null;
        }

        // 4. Multiply inverted matrix by received data to get original data
        const originalData = Buffer.alloc(this.k * shardSize);
        for (let i = 0; i < this.k; i++) { // For each byte in original data
            for (let j = 0; j < shardSize; j++) { // For each byte in shard
                let sum = 0;
                for (let s = 0; s < this.k; s++) { // For each available shard
                    sum ^= GF256.mul(inverted[i][s], sortedShards[s].data[j]);
                }
                originalData[i * shardSize + j] = sum;
            }
        }

        return originalData.slice(0, originalSize);
    }

    private invertMatrix(matrix: number[][]): number[][] | null {
        const size = matrix.length;
        const result: number[][] = [];
        const work: number[][] = [];

        for (let i = 0; i < size; i++) {
            result[i] = new Array(size).fill(0);
            result[i][i] = 1;
            work[i] = [...matrix[i]];
        }

        for (let i = 0; i < size; i++) {
            // Find pivot
            if (work[i][i] === 0) {
                let found = false;
                for (let j = i + 1; j < size; j++) {
                    if (work[j][i] !== 0) {
                        [work[i], work[j]] = [work[j], work[i]];
                        [result[i], result[j]] = [result[j], result[i]];
                        found = true;
                        break;
                    }
                }
                if (!found) return null;
            }

            // Normalize row
            const factor = work[i][i];
            for (let j = 0; j < size; j++) {
                work[i][j] = GF256.div(work[i][j], factor);
                result[i][j] = GF256.div(result[i][j], factor);
            }

            // Eliminate others
            for (let j = 0; j < size; j++) {
                if (i !== j) {
                    const f = work[j][i];
                    for (let l = 0; l < size; l++) {
                        work[j][l] ^= GF256.mul(f, work[i][l]);
                        result[j][l] ^= GF256.mul(f, result[i][l]);
                    }
                }
            }
        }

        return result;
    }
}

