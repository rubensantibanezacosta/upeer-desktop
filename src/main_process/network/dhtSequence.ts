export const MAX_DHT_SEQ_JUMP = 24 * 60 * 60 * 1000;

export function validateDhtSequence(currentSeq: number, newSeq: number): {
    valid: boolean;
    requiresPoW: boolean;
    reason?: string;
} {
    if (newSeq < currentSeq) {
        return { valid: false, requiresPoW: false, reason: 'Sequence rollback detected' };
    }
    if (newSeq === currentSeq) {
        return { valid: true, requiresPoW: false, reason: 'Sequence identical' };
    }
    if (currentSeq === 0) {
        return { valid: true, requiresPoW: false };
    }

    const jump = newSeq - currentSeq;
    if (jump > MAX_DHT_SEQ_JUMP) {
        return { valid: false, requiresPoW: true, reason: `Sequence jump too large: ${jump} > ${MAX_DHT_SEQ_JUMP}` };
    }

    return { valid: true, requiresPoW: false };
}
