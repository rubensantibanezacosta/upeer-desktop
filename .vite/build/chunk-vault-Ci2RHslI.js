import { t as error, d as debug, q as getMyUPeerId, m as getContacts, i as info, o as sendSecureUDPMessage } from "./main-lAzLifty.js";
import { t as trackDistributedAsset } from "./asset-operations-DymvH6mt.js";
import "better-sqlite3";
import "node:path";
import "node:fs";
import "sodium-native";
import "node:crypto";
import { SHARD_TTL_MS } from "./manager-DI4fM3Sg.js";
const _GF256 = class _GF256 {
  static init() {
    if (this.initialized) return;
    let x = 1;
    for (let i = 0; i < 255; i++) {
      this.exp[i] = x;
      this.log[x] = i;
      x <<= 1;
      if (x & 256) x ^= 285;
    }
    for (let i = 0; i < 255; i++) {
      this.exp[i + 255] = this.exp[i];
    }
    this.initialized = true;
  }
  static mul(a, b) {
    this.init();
    if (a === 0 || b === 0) return 0;
    return this.exp[this.log[a] + this.log[b]];
  }
  static div(a, b) {
    this.init();
    if (a === 0) return 0;
    if (b === 0) throw new Error("GF256: division by zero");
    return this.exp[this.log[a] + 255 - this.log[b]];
  }
  static pow(a, n) {
    this.init();
    if (a === 0) return 0;
    return this.exp[this.log[a] * n % 255];
  }
};
_GF256.exp = new Uint8Array(512);
_GF256.log = new Uint8Array(256);
_GF256.initialized = false;
let GF256 = _GF256;
class ErasureCoder {
  constructor(k = 4, m = 8) {
    this.k = k;
    this.m = m;
    this.n = k + m;
    if (this.n > 256) throw new Error("Total shards cannot exceed 256");
  }
  /**
   * Encodes a buffer into shards.
   * The original data is split into k shards, and m parity shards are created.
   */
  encode(data) {
    const shardSize = Math.ceil(data.length / this.k);
    const paddedData = Buffer.alloc(shardSize * this.k);
    data.copy(paddedData);
    const shards = [];
    for (let i = 0; i < this.k; i++) {
      shards.push(paddedData.slice(i * shardSize, (i + 1) * shardSize));
    }
    for (let i = 0; i < this.m; i++) {
      const parityShard = Buffer.alloc(shardSize);
      const rowIdx = this.k + i;
      for (let j = 0; j < shardSize; j++) {
        let sum = 0;
        for (let s = 0; s < this.k; s++) {
          const coeff = GF256.div(1, rowIdx ^ s || 1);
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
  decode(shards, originalSize) {
    if (shards.length < this.k) {
      error("Insufficient shards for reconstruction", { expected: this.k, received: shards.length }, "erasure");
      return null;
    }
    const shardSize = shards[0].data.length;
    const sortedShards = shards.sort((a, b) => a.index - b.index).slice(0, this.k);
    const matrix = [];
    for (const s of sortedShards) {
      const row = new Array(this.k).fill(0);
      if (s.index < this.k) {
        row[s.index] = 1;
      } else {
        for (let j = 0; j < this.k; j++) {
          row[j] = GF256.div(1, s.index ^ j || 1);
        }
      }
      matrix.push(row);
    }
    const inverted = this.invertMatrix(matrix);
    if (!inverted) {
      error("Failed to invert encoding matrix", {}, "erasure");
      return null;
    }
    const originalData = Buffer.alloc(this.k * shardSize);
    for (let i = 0; i < this.k; i++) {
      for (let j = 0; j < shardSize; j++) {
        let sum = 0;
        for (let s = 0; s < this.k; s++) {
          sum ^= GF256.mul(inverted[i][s], sortedShards[s].data[j]);
        }
        originalData[i * shardSize + j] = sum;
      }
    }
    return originalData.slice(0, originalSize);
  }
  invertMatrix(matrix) {
    const size = matrix.length;
    const result = [];
    const work = [];
    for (let i = 0; i < size; i++) {
      result[i] = new Array(size).fill(0);
      result[i][i] = 1;
      work[i] = [...matrix[i]];
    }
    for (let i = 0; i < size; i++) {
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
      const factor = work[i][i];
      for (let j = 0; j < size; j++) {
        work[i][j] = GF256.div(work[i][j], factor);
        result[i][j] = GF256.div(result[i][j], factor);
      }
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
const _ChunkVault = class _ChunkVault {
  /**
   * Replicates a file across the social network using Erasure Coding.
   * @param fileHash The SHA-256 hash of the original file.
   * @param data The complete file buffer.
   * @param recipientSid Optional: If this file is for a specific person offline.
   */
  static async replicateFile(fileHash, data, recipientSid = "*") {
    const threshold = 1024 * 1024;
    if (data.length < threshold) {
      debug("Using Mirroring for small file", { fileHash, size: data.length }, "vault");
      const { sign } = await import("./main-lAzLifty.js").then((n) => n.ah);
      const { canonicalStringify } = await import("./main-lAzLifty.js").then((n) => n.ai);
      const myId = getMyUPeerId();
      const fileDataPacket = {
        type: "FILE_DATA_SMALL",
        fileHash,
        data: data.toString("hex")
      };
      const signature = sign(Buffer.from(canonicalStringify(fileDataPacket)));
      const signedPacket = {
        ...fileDataPacket,
        senderRevelnestId: myId,
        signature: signature.toString("hex")
      };
      const { VaultManager } = await import("./manager-DI4fM3Sg.js");
      return VaultManager.replicateToVaults(recipientSid, signedPacket);
    }
    try {
      const shards = this.coder.encode(data);
      const myId = getMyUPeerId();
      const allContacts = await getContacts();
      const candidates = allContacts.filter((c) => c.status === "connected" && c.upeerId !== myId).sort((a, b) => new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime());
      if (candidates.length === 0) {
        debug("No custodians available for file replication", { fileHash }, "vault");
        return;
      }
      info("Starting distributed file replication", {
        fileHash,
        shards: shards.length,
        custodians: Math.min(candidates.length, 12)
      }, "vault");
      for (let i = 0; i < shards.length; i++) {
        const shard = shards[i];
        const custodian = candidates[i % candidates.length];
        const cid = `shard:${fileHash}:${i}`;
        const expiresAt = Date.now() + SHARD_TTL_MS;
        const vaultPacket = {
          type: "VAULT_STORE",
          payloadHash: cid,
          recipientSid,
          // Can be a specific ID or '*' for public-within-friends
          senderSid: myId,
          priority: 3,
          // Low priority (Background/Heavy)
          data: shard.toString("hex"),
          expiresAt
        };
        sendSecureUDPMessage(custodian.address, vaultPacket);
        if (custodian && custodian.upeerId) {
          await trackDistributedAsset(fileHash, cid, i, shards.length, custodian.upeerId);
        }
      }
      debug("File distribution complete", { fileHash }, "vault");
    } catch (err) {
      error("Failed to replicate file to vault", err, "vault");
    }
  }
};
_ChunkVault.coder = new ErasureCoder(4, 8);
let ChunkVault = _ChunkVault;
export {
  ChunkVault
};
