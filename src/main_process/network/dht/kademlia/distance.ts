// XOR distance between two Kademlia IDs
export function xorDistance(id1: Buffer, id2: Buffer): Buffer {
    if (id1.length !== id2.length) {
        throw new Error(`ID length mismatch: ${id1.length} vs ${id2.length}`);
    }
    const result = Buffer.alloc(id1.length);
    for (let i = 0; i < id1.length; i++) {
        result[i] = id1[i] ^ id2[i];
    }
    return result;
}

// Compare distances: returns -1 if a < b, 0 if equal, 1 if a > b
export function compareDistance(a: Buffer, b: Buffer, target: Buffer): number {
    const distA = xorDistance(a, target);
    const distB = xorDistance(b, target);
    
    for (let i = 0; i < distA.length; i++) {
        if (distA[i] < distB[i]) return -1;
        if (distA[i] > distB[i]) return 1;
    }
    return 0;
}

// Calculate bucket index for a given ID based on XOR distance from nodeId
export function getBucketIndex(nodeId: Buffer, otherId: Buffer): number {
    const distance = xorDistance(nodeId, otherId);
    
    // Find the most significant bit that differs
    for (let byte = 0; byte < distance.length; byte++) {
        if (distance[byte] !== 0) {
            for (let bit = 7; bit >= 0; bit--) {
                if (distance[byte] & (1 << bit)) {
                    return byte * 8 + (7 - bit);
                }
            }
        }
    }
    
    return 159; // Same ID (shouldn't happen for other nodes)
}