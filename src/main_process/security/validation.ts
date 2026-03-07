/**
 * Input validation for RevelNest P2P messages
 * Provides strict validation to prevent malformed packets and injection attacks
 */

interface ValidationResult {
    valid: boolean;
    error?: string;
}

export function validateHandshakeReq(data: any): ValidationResult {
    if (!data.publicKey || typeof data.publicKey !== 'string' || data.publicKey.length !== 64) {
        return { valid: false, error: 'Invalid publicKey' };
    }
    if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== 'string' || data.ephemeralPublicKey.length !== 64)) {
        return { valid: false, error: 'Invalid ephemeralPublicKey' };
    }
    if (data.alias && typeof data.alias !== 'string') {
        return { valid: false, error: 'Invalid alias' };
    }
    if (data.alias && data.alias.length > 100) {
        return { valid: false, error: 'Alias too long' };
    }
    if (data.powProof && (typeof data.powProof !== 'string' || !/^[0-9a-f]+$/i.test(data.powProof))) {
        return { valid: false, error: 'Invalid powProof format' };
    }
    return { valid: true };
}

export function validateHandshakeAccept(data: any): ValidationResult {
    if (!data.publicKey || typeof data.publicKey !== 'string' || data.publicKey.length !== 64) {
        return { valid: false, error: 'Invalid publicKey' };
    }
    if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== 'string' || data.ephemeralPublicKey.length !== 64)) {
        return { valid: false, error: 'Invalid ephemeralPublicKey' };
    }
    return { valid: true };
}

export function validateChat(data: any): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid message id' };
    }
    if (!data.content || typeof data.content !== 'string') {
        return { valid: false, error: 'Invalid content' };
    }
    if (data.content.length > 10000) {
        return { valid: false, error: 'Content too long' };
    }
    if (data.nonce && (typeof data.nonce !== 'string' || data.nonce.length !== 48)) {
        return { valid: false, error: 'Invalid nonce' };
    }
    if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== 'string' || data.ephemeralPublicKey.length !== 64)) {
        return { valid: false, error: 'Invalid ephemeralPublicKey' };
    }
    if (data.replyTo && (typeof data.replyTo !== 'string' || data.replyTo.length > 100)) {
        return { valid: false, error: 'Invalid replyTo' };
    }
    return { valid: true };
}

export function validateAck(data: any): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid ack id' };
    }
    return { valid: true };
}

export function validateRead(data: any): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid read id' };
    }
    return { valid: true };
}

export function validateTyping(data: any): ValidationResult {
    // No fields required for typing indicator
    return { valid: true };
}

export function validatePingPong(data: any): ValidationResult {
    // No fields required for ping/pong
    return { valid: true };
}

export function validateChatReaction(data: any): ValidationResult {
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 100) {
        return { valid: false, error: 'Invalid msgId' };
    }
    if (!data.emoji || typeof data.emoji !== 'string' || data.emoji.length > 10) {
        return { valid: false, error: 'Invalid emoji' };
    }
    if (typeof data.remove !== 'boolean') {
        return { valid: false, error: 'Invalid remove flag' };
    }
    return { valid: true };
}

export function validateChatUpdate(data: any): ValidationResult {
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 100) {
        return { valid: false, error: 'Invalid msgId' };
    }
    if (!data.content || typeof data.content !== 'string') {
        return { valid: false, error: 'Invalid content' };
    }
    if (data.content.length > 10000) {
        return { valid: false, error: 'Content too long' };
    }
    if (data.nonce && (typeof data.nonce !== 'string' || data.nonce.length !== 48)) {
        return { valid: false, error: 'Invalid nonce' };
    }
    if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== 'string' || data.ephemeralPublicKey.length !== 64)) {
        return { valid: false, error: 'Invalid ephemeralPublicKey' };
    }
    return { valid: true };
}

export function validateChatDelete(data: any): ValidationResult {
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 100) {
        return { valid: false, error: 'Invalid msgId' };
    }
    return { valid: true };
}

export function validateDhtQuery(data: any): ValidationResult {
    if (!data.targetId || typeof data.targetId !== 'string' || data.targetId.length !== 32) {
        return { valid: false, error: 'Invalid targetId' };
    }
    return { valid: true };
}

export function validateDhtResponse(data: any): ValidationResult {
    if (!data.targetId || typeof data.targetId !== 'string' || data.targetId.length !== 32) {
        return { valid: false, error: 'Invalid targetId' };
    }
    // locationBlock or neighbors are optional
    if (data.locationBlock) {
        if (!data.locationBlock.address || typeof data.locationBlock.address !== 'string') {
            return { valid: false, error: 'Invalid locationBlock.address' };
        }
        if (typeof data.locationBlock.dhtSeq !== 'number' || data.locationBlock.dhtSeq < 0) {
            return { valid: false, error: 'Invalid locationBlock.dhtSeq' };
        }
        if (!data.locationBlock.signature || typeof data.locationBlock.signature !== 'string' || data.locationBlock.signature.length !== 128) {
            return { valid: false, error: 'Invalid locationBlock.signature' };
        }
    }
    if (data.neighbors && !Array.isArray(data.neighbors)) {
        return { valid: false, error: 'Invalid neighbors array' };
    }
    return { valid: true };
}

export function validateDhtUpdate(data: any): ValidationResult {
    if (!data.locationBlock || typeof data.locationBlock !== 'object') {
        return { valid: false, error: 'Missing locationBlock' };
    }
    if (!data.locationBlock.address || typeof data.locationBlock.address !== 'string') {
        return { valid: false, error: 'Invalid locationBlock.address' };
    }
    if (typeof data.locationBlock.dhtSeq !== 'number' || data.locationBlock.dhtSeq < 0) {
        return { valid: false, error: 'Invalid locationBlock.dhtSeq' };
    }
    if (!data.locationBlock.signature || typeof data.locationBlock.signature !== 'string' || data.locationBlock.signature.length !== 128) {
        return { valid: false, error: 'Invalid locationBlock.signature' };
    }
    return { valid: true };
}

export function validateDhtExchange(data: any): ValidationResult {
    if (!Array.isArray(data.peers)) {
        return { valid: false, error: 'Invalid peers array' };
    }
    // Limit array size to prevent DoS
    if (data.peers.length > 50) {
        return { valid: false, error: 'Too many peers' };
    }
    // Basic validation of each peer (more thorough validation done elsewhere)
    for (const peer of data.peers) {
        if (!peer.revelnestId || typeof peer.revelnestId !== 'string' || peer.revelnestId.length !== 32) {
            return { valid: false, error: 'Invalid peer revelnestId' };
        }
        if (!peer.publicKey || typeof peer.publicKey !== 'string' || peer.publicKey.length !== 64) {
            return { valid: false, error: 'Invalid peer publicKey' };
        }
    }
    return { valid: true };
}

export function validateDhtFindNode(data: any): ValidationResult {
    if (!data.target || typeof data.target !== 'string' || data.target.length !== 32) {
        return { valid: false, error: 'Invalid target' };
    }
    return { valid: true };
}

export function validateDhtFindValue(data: any): ValidationResult {
    if (!data.key || typeof data.key !== 'string' || data.key.length !== 64) {
        return { valid: false, error: 'Invalid key' };
    }
    return { valid: true };
}

export function validateDhtStore(data: any): ValidationResult {
    if (!data.key || typeof data.key !== 'string' || data.key.length !== 64) {
        return { valid: false, error: 'Invalid key' };
    }
    if (!data.value || typeof data.value !== 'string') {
        return { valid: false, error: 'Invalid value' };
    }
    if (data.value.length > 10000) {
        return { valid: false, error: 'Value too large' };
    }
    if (typeof data.ttl !== 'number' || data.ttl < 0 || data.ttl > 2592000) {
        return { valid: false, error: 'Invalid TTL' };
    }
    return { valid: true };
}

export function validateFileProposal(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (!data.fileName || typeof data.fileName !== 'string') return { valid: false, error: 'Invalid fileName' };
    if (typeof data.fileSize !== 'number' || data.fileSize < 0) return { valid: false, error: 'Invalid fileSize' };
    return { valid: true };
}

export function validateFileAccept(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    return { valid: true };
}

export function validateFileChunk(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (typeof data.chunkIndex !== 'number' || data.chunkIndex < 0) return { valid: false, error: 'Invalid chunkIndex' };
    if (!data.data || typeof data.data !== 'string') return { valid: false, error: 'Invalid chunk data' };
    return { valid: true };
}

export function validateFileChunkAck(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (typeof data.chunkIndex !== 'number') return { valid: false, error: 'Invalid chunkIndex' };
    return { valid: true };
}

export function validateFileDoneAck(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    return { valid: true };
}

export function validateFileCancel(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') {
        return { valid: false, error: 'Invalid fileId' };
    }
    return { valid: true };
}

/**
 * Main validation router
 */
export function validateMessage(type: string, data: any): ValidationResult {
    switch (type) {
        case 'HANDSHAKE_REQ':
            return validateHandshakeReq(data);
        case 'HANDSHAKE_ACCEPT':
            return validateHandshakeAccept(data);
        case 'CHAT':
            return validateChat(data);
        case 'ACK':
            return validateAck(data);
        case 'READ':
            return validateRead(data);
        case 'TYPING':
            return validateTyping(data);
        case 'PING':
        case 'PONG':
            return validatePingPong(data);
        case 'CHAT_REACTION':
            return validateChatReaction(data);
        case 'CHAT_UPDATE':
            return validateChatUpdate(data);
        case 'CHAT_DELETE':
            return validateChatDelete(data);
        case 'DHT_QUERY':
            return validateDhtQuery(data);
        case 'DHT_RESPONSE':
            return validateDhtResponse(data);
        case 'DHT_UPDATE':
            return validateDhtUpdate(data);
        case 'DHT_EXCHANGE':
            return validateDhtExchange(data);
        case 'DHT_FIND_NODE':
            return validateDhtFindNode(data);
        case 'DHT_FIND_VALUE':
            return validateDhtFindValue(data);
        case 'DHT_STORE':
            return validateDhtStore(data);
        case 'FILE_PROPOSAL':
        case 'FILE_START':
            return validateFileProposal(data);
        case 'FILE_ACCEPT':
            return validateFileAccept(data);
        case 'FILE_CHUNK':
            return validateFileChunk(data);
        case 'FILE_CHUNK_ACK':
        case 'FILE_ACK':
            return validateFileChunkAck(data);
        case 'FILE_DONE_ACK':
        case 'FILE_END':
            return validateFileDoneAck(data);
        case 'FILE_CANCEL':
            return validateFileCancel(data);
        default:
            // Unknown message type - reject
            return { valid: false, error: `Unknown message type: ${type}` };
    }
}