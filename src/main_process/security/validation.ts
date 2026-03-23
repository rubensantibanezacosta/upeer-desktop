/**
 * Input validation for upeer P2P messages
 * Provides strict validation to prevent malformed packets and injection attacks
 */

interface ValidationResult {
    valid: boolean;
    error?: string;
}

const HEX_ID_RE = /^[0-9a-f]+$/i;
const isValidHexId = (s: unknown) =>
    typeof s === 'string' && s.length >= 32 && s.length <= 128 && HEX_ID_RE.test(s);

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
    // BUG AD fix: sin límite de tamaño del avatar, un peer podía enviar hasta 10MB
    // (límite del frameBuf) que se escribía directamente en SQLite inflando la BD.
    // 307200 chars base64 ≈ 230 KB imagen real — suficiente para cualquier avatar.
    if (data.avatar && (typeof data.avatar !== 'string' || data.avatar.length > 307200)) {
        return { valid: false, error: 'Avatar too large or invalid' };
    }
    // BUG DL fix: el regex anterior !/^[0-9a-f]+$/i rechazaba el formato JSON del PoW Argon2id
    // ({"s":"<32 hex>","t":<timestamp>}), bloqueando completamente la conexión de contactos nuevos
    // (isNewContact=true requiere PoW). Además, sin cap de longitud → Buffer.from(saltHex,'hex')
    // en verifyLightProof asignaba hasta 5MB antes de rechazar el salt por tamaño incorrecto.
    // Aceptar: formato JSON (Argon2id, ≤256 chars) o formato hex legacy (SHA-256, ≤64 chars).
    if (data.powProof !== undefined) {
        if (typeof data.powProof !== 'string' || data.powProof.length > 256) {
            return { valid: false, error: 'Invalid powProof (too long or wrong type)' };
        }
        // Aceptar JSON (Argon2id) o hex puro (legacy SHA-256)
        if (!data.powProof.startsWith('{') && !/^[0-9a-f]+$/i.test(data.powProof)) {
            return { valid: false, error: 'Invalid powProof format' };
        }
    }
    // BUG DC fix (REQ): signedPreKey.spkPub/spkSig sin restricción → Buffer.from arbitrario.
    // Misma validación que en validateHandshakeAccept.
    if (data.signedPreKey !== undefined && data.signedPreKey !== null) {
        const spk = data.signedPreKey;
        if (typeof spk !== 'object') {
            return { valid: false, error: 'signedPreKey must be an object' };
        }
        if (spk.spkPub !== undefined && (typeof spk.spkPub !== 'string' || spk.spkPub.length !== 64)) {
            return { valid: false, error: 'Invalid signedPreKey.spkPub (expected 64 hex chars)' };
        }
        if (spk.spkSig !== undefined && (typeof spk.spkSig !== 'string' || spk.spkSig.length !== 128)) {
            return { valid: false, error: 'Invalid signedPreKey.spkSig (expected 128 hex chars)' };
        }
        if (spk.spkId !== undefined && (typeof spk.spkId !== 'number' || !Number.isInteger(spk.spkId) || spk.spkId < 0)) {
            return { valid: false, error: 'Invalid signedPreKey.spkId' };
        }
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
    // BUG AD fix: mismo límite de avatar que en HANDSHAKE_REQ.
    if (data.avatar && (typeof data.avatar !== 'string' || data.avatar.length > 307200)) {
        return { valid: false, error: 'Avatar too large or invalid' };
    }
    // BUG DB fix: alias no estaba limitado en HANDSHAKE_ACCEPT aunque sí en HANDSHAKE_REQ y PING.
    // El handler escribe data.alias directamente a la tabla contacts via updateContactName.
    if (data.alias && (typeof data.alias !== 'string' || data.alias.length > 100)) {
        return { valid: false, error: 'Alias too long or invalid in HANDSHAKE_ACCEPT' };
    }
    // BUG DC fix: signedPreKey.spkPub y spkSig sin restricción de longitud →
    // Buffer.from(spkPub, 'hex') asigna (length/2) bytes antes de que sodium rechace
    // el tamaño incorrecto. Ed25519 pk = 32 bytes (64 hex), sig = 64 bytes (128 hex).
    if (data.signedPreKey !== undefined && data.signedPreKey !== null) {
        const spk = data.signedPreKey;
        if (typeof spk !== 'object') {
            return { valid: false, error: 'signedPreKey must be an object' };
        }
        if (spk.spkPub !== undefined && (typeof spk.spkPub !== 'string' || spk.spkPub.length !== 64)) {
            return { valid: false, error: 'Invalid signedPreKey.spkPub (expected 64 hex chars)' };
        }
        if (spk.spkSig !== undefined && (typeof spk.spkSig !== 'string' || spk.spkSig.length !== 128)) {
            return { valid: false, error: 'Invalid signedPreKey.spkSig (expected 128 hex chars)' };
        }
        if (spk.spkId !== undefined && (typeof spk.spkId !== 'number' || !Number.isInteger(spk.spkId) || spk.spkId < 0)) {
            return { valid: false, error: 'Invalid signedPreKey.spkId' };
        }
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
    // BUG U3 fix: data.content es ciphertext hex-encoded (DR o crypto_box).
    // Con 10,000 chars el límite efectivo era ~5KB de plaintext, rechazando
    // mensajes legítimos cifrados con Double Ratchet de más de ~5KB.
    // 200,000 chars = ~100KB plaintext — suficiente para cualquier mensaje de texto.
    if (data.content.length > 200_000) {
        return { valid: false, error: 'Content too long' };
    }
    // BUG DK fix (defensa en profundidad): si hay cifrado, el ciphertext mínimo es
    // crypto_secretbox_MACBYTES = 16 bytes = 32 hex chars. Longitudes menores causarían
    // Buffer.alloc(negativo) en ratchetDecrypt después de mutar el estado del ratchet.
    if ((data.ratchetHeader || data.nonce) && data.content.length < 32) {
        return { valid: false, error: 'Ciphertext too short (min 32 hex chars)' };
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
    // BUG CO fix: los campos de x3dhInit (ikPub, ekPub) se convierten a Buffer
    // directamente con Buffer.from(ikPub, 'hex') sin límite de tamaño.
    // Un peer puede enviar "ikPub": "a".repeat(10_000_000) → asignación de 5MB por paquete.
    // Las claves Ed25519/X25519 son exactamente 32 bytes = 64 chars hex.
    if (data.x3dhInit) {
        const xi = data.x3dhInit;
        if (typeof xi !== 'object' || xi === null) return { valid: false, error: 'x3dhInit must be an object' };
        if (!xi.ikPub || typeof xi.ikPub !== 'string' || xi.ikPub.length !== 64)
            return { valid: false, error: 'Invalid x3dhInit.ikPub' };
        if (!xi.ekPub || typeof xi.ekPub !== 'string' || xi.ekPub.length !== 64)
            return { valid: false, error: 'Invalid x3dhInit.ekPub' };
        if (typeof xi.spkId !== 'number' || !Number.isInteger(xi.spkId) || xi.spkId < 0)
            return { valid: false, error: 'Invalid x3dhInit.spkId' };
    }
    // ratchetHeader: si existe, debe ser un objeto con campos limitados (DH pub key, índices).
    if (data.ratchetHeader) {
        const rh = data.ratchetHeader;
        if (typeof rh !== 'object' || rh === null) return { valid: false, error: 'ratchetHeader must be an object' };
        if (rh.dh && (typeof rh.dh !== 'string' || rh.dh.length !== 64))
            return { valid: false, error: 'Invalid ratchetHeader.dh' };
        if (rh.pn !== undefined && (typeof rh.pn !== 'number' || rh.pn < 0 || rh.pn > 1_000_000))
            return { valid: false, error: 'Invalid ratchetHeader.pn' };
        if (rh.n !== undefined && (typeof rh.n !== 'number' || rh.n < 0 || rh.n > 1_000_000))
            return { valid: false, error: 'Invalid ratchetHeader.n' };
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

export function validateTyping(_data: any): ValidationResult {
    // No fields required for typing indicator
    return { valid: true };
}

export function validatePingPong(data: any): ValidationResult {
    // BUG AD fix: PING transporta ephemeralPublicKey (rotación) y opcionalmente avatar.
    // Sin validación un peer podía enviar un avatar de hasta 10MB en cada PING.
    if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== 'string' || data.ephemeralPublicKey.length !== 64)) {
        return { valid: false, error: 'Invalid ephemeralPublicKey in PING' };
    }
    if (data.avatar && (typeof data.avatar !== 'string' || data.avatar.length > 307200)) {
        return { valid: false, error: 'Avatar too large or invalid in PING' };
    }
    // BUG CQ fix: alias sin límite de tamaño → peer podía enviar 10MB y almacenarlo en DB.
    if (data.alias && (typeof data.alias !== 'string' || data.alias.length > 100)) {
        return { valid: false, error: 'Alias too long or invalid in PING' };
    }
    if (data.signedPreKey !== undefined && data.signedPreKey !== null) {
        const spk = data.signedPreKey;
        if (typeof spk !== 'object') return { valid: false, error: 'signedPreKey must be an object' };
        if (spk.spkPub !== undefined && (typeof spk.spkPub !== 'string' || spk.spkPub.length !== 64))
            return { valid: false, error: 'Invalid signedPreKey.spkPub in PING' };
        if (spk.spkSig !== undefined && (typeof spk.spkSig !== 'string' || spk.spkSig.length !== 128))
            return { valid: false, error: 'Invalid signedPreKey.spkSig in PING' };
        if (spk.spkId !== undefined && (typeof spk.spkId !== 'number' || !Number.isInteger(spk.spkId) || spk.spkId < 0))
            return { valid: false, error: 'Invalid signedPreKey.spkId in PING' };
    }
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
    if (data.content.length > 200_000) {
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
    // BUG DD fix: firma interior (vault delivery) sin límite de longitud.
    // Ed25519 signature = 64 bytes = 128 hex chars. Sin esta comprobación,
    // Buffer.from(deleteSig, 'hex') en handleIncomingDelete asignaba hasta
    // 500KB (capped por entry vault 1MB) antes de que sodium lo rechazara.
    if (data.signature !== undefined &&
        (typeof data.signature !== 'string' || data.signature.length !== 128)) {
        return { valid: false, error: 'Invalid signature (expected 128 hex chars)' };
    }
    return { valid: true };
}

export function validateChatClear(data: any): ValidationResult {
    if (!isValidHexId(data.chatUpeerId)) {
        return { valid: false, error: 'Invalid chatUpeerId' };
    }
    if (data.timestamp !== undefined && (typeof data.timestamp !== 'number' || data.timestamp < 0)) {
        return { valid: false, error: 'Invalid timestamp' };
    }
    // Firma obligatoria para CHAT_CLEAR_ALL
    if (!data.signature || typeof data.signature !== 'string' || data.signature.length !== 128) {
        return { valid: false, error: 'Invalid or missing signature (expected 128 hex chars)' };
    }
    return { valid: true };
}

export function validateDhtQuery(data: any): ValidationResult {
    if (!isValidHexId(data.targetId)) {
        return { valid: false, error: 'Invalid targetId' };
    }
    return { valid: true };
}

export function validateDhtResponse(data: any): ValidationResult {
    if (!isValidHexId(data.targetId)) {
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
    // Optional powProof for large sequence jumps
    if (data.locationBlock.powProof !== undefined) {
        if (typeof data.locationBlock.powProof !== 'string' || data.locationBlock.powProof.length > 256) {
            return { valid: false, error: 'Invalid powProof (too long or wrong type)' };
        }
        // Format validation: either JSON or hex
        if (!data.locationBlock.powProof.startsWith('{') && !/^[0-9a-f]+$/i.test(data.locationBlock.powProof)) {
            return { valid: false, error: 'Invalid powProof format' };
        }
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
        if (!isValidHexId(peer.upeerId)) {
            return { valid: false, error: 'Invalid peer upeerId' };
        }
        if (!peer.publicKey || typeof peer.publicKey !== 'string' || peer.publicKey.length !== 64) {
            return { valid: false, error: 'Invalid peer publicKey' };
        }
        // Validate locationBlock if present
        if (peer.locationBlock && typeof peer.locationBlock === 'object') {
            const lb = peer.locationBlock;
            if (!lb.address || typeof lb.address !== 'string') {
                return { valid: false, error: 'Invalid peer locationBlock.address' };
            }
            if (typeof lb.dhtSeq !== 'number' || lb.dhtSeq < 0) {
                return { valid: false, error: 'Invalid peer locationBlock.dhtSeq' };
            }
            if (!lb.signature || typeof lb.signature !== 'string' || lb.signature.length !== 128) {
                return { valid: false, error: 'Invalid peer locationBlock.signature' };
            }
            // Optional powProof for large sequence jumps
            if (lb.powProof !== undefined) {
                if (typeof lb.powProof !== 'string' || lb.powProof.length > 256) {
                    return { valid: false, error: 'Invalid powProof (too long or wrong type)' };
                }
                // Format validation: either JSON or hex
                if (!lb.powProof.startsWith('{') && !/^[0-9a-f]+$/i.test(lb.powProof)) {
                    return { valid: false, error: 'Invalid powProof format' };
                }
            }
        }
    }
    return { valid: true };
}

export function validateDhtFindNode(data: any): ValidationResult {
    // BUG CY fix: el campo era 'target' pero handleFindNode lee 'targetId'.
    // Un atacante podía enviar target válido (pasaba validación) + targetId enorme
    // → Buffer.from(data.targetId, 'hex') asignaba megabytes de RAM.
    // Ahora se valida 'targetId' directamente, con cap de 128 hex chars (64 bytes).
    if (!data.targetId || typeof data.targetId !== 'string'
        || !/^[0-9a-f]+$/i.test(data.targetId)
        || data.targetId.length > 128) {
        return { valid: false, error: 'Invalid targetId' };
    }
    return { valid: true };
}

export function validateDhtFindValue(data: any): ValidationResult {
    // BUG DA fix: hay dos tipos de clave en uso:
    //   - location blocks: toKademliaId → SHA-256 primeros 20 bytes = 40 hex chars
    //   - renewal tokens: createRenewalTokenKey → SHA-256 completo = 64 hex chars
    // El validador anterior solo aceptaba 64 → rechazaba todas las consultas de
    // location blocks, rompiendo el DHT para el caso de uso principal.
    if (!data.key || typeof data.key !== 'string'
        || !/^[0-9a-f]+$/i.test(data.key)
        || (data.key.length !== 40 && data.key.length !== 64)) {
        return { valid: false, error: 'Invalid key (expected 40 or 64 hex chars)' };
    }
    return { valid: true };
}

export function validateDhtStore(data: any): ValidationResult {
    // BUG DA (clave): aceptar 40 o 64 hex chars (ver validateDhtFindValue)
    if (!data.key || typeof data.key !== 'string'
        || !/^[0-9a-f]+$/i.test(data.key)
        || (data.key.length !== 40 && data.key.length !== 64)) {
        return { valid: false, error: 'Invalid key (expected 40 or 64 hex chars)' };
    }
    // BUG CZ fix: el validador anterior exigía typeof value === 'string', pero
    // storeValue() envía value como objeto (locationBlock) porque el serializado
    // JSON ocurre al convertir el paquete a Buffer en sendSecureUDPMessage.
    // Resultado: todos los DHT_STORE de replicación eran rechazados → el DHT
    // Kademlia nunca replicaba location blocks a otros nodos.
    // Ahora se acepta string u objeto; el cap de tamaño se aplica sobre la
    // representación JSON para cubrir ambos casos y evitar OOM.
    if (data.value === null || data.value === undefined) {
        return { valid: false, error: 'Missing value' };
    }
    try {
        const serialized = typeof data.value === 'string'
            ? data.value
            : JSON.stringify(data.value);
        if (serialized.length > 10_000) {
            return { valid: false, error: 'Value too large' };
        }
    } catch {
        return { valid: false, error: 'Value not serializable' };
    }
    // BUG CZ fix: ttl es opcional (storeValue usa 'timestamp', no 'ttl').
    // Exigirlo rompía cualquier DHT_STORE emitido por la propia app.
    if (data.ttl !== undefined
        && (typeof data.ttl !== 'number' || data.ttl < 0 || data.ttl > 2592000)) {
        return { valid: false, error: 'Invalid TTL' };
    }
    return { valid: true };
}

export function validateDhtStoreAck(data: any): ValidationResult {
    if (!data.key || typeof data.key !== 'string'
        || !/^[0-9a-f]+$/i.test(data.key)
        || (data.key.length !== 40 && data.key.length !== 64)) {
        return { valid: false, error: 'Invalid key (expected 40 or 64 hex chars)' };
    }
    return { valid: true };
}

export function validateDhtFoundNodes(data: any): ValidationResult {
    if (!Array.isArray(data.nodes)) return { valid: false, error: 'Missing or invalid nodes array' };
    if (data.nodes.length > 20) return { valid: false, error: 'Too many nodes (max 20)' };
    for (const node of data.nodes) {
        if (typeof node !== 'object' || node === null) return { valid: false, error: 'Invalid node entry' };
        if (typeof node.upeerId !== 'string' || !/^[0-9a-f]+$/i.test(node.upeerId) || node.upeerId.length > 128)
            return { valid: false, error: 'Invalid node.upeerId' };
        if (typeof node.address !== 'string' || node.address.length > 100)
            return { valid: false, error: 'Invalid node.address' };
    }
    return { valid: true };
}

export function validateDhtFoundValue(data: any): ValidationResult {
    if (data.key !== undefined && (typeof data.key !== 'string' || !/^[0-9a-f]+$/i.test(data.key) || (data.key.length !== 40 && data.key.length !== 64)))
        return { valid: false, error: 'Invalid key' };
    if (data.value === undefined && data.nodes === undefined)
        return { valid: false, error: 'Missing value or nodes' };
    if (data.value !== undefined) {
        try {
            const serialized = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
            if (serialized.length > 10_000) return { valid: false, error: 'Value too large' };
        } catch {
            return { valid: false, error: 'Value not serializable' };
        }
    }
    return { valid: true };
}

export function validateDhtPing(data: any): ValidationResult {
    if (data.nodeId !== undefined && (typeof data.nodeId !== 'string' || !/^[0-9a-f]+$/i.test(data.nodeId) || data.nodeId.length > 128))
        return { valid: false, error: 'Invalid nodeId' };
    return { valid: true };
}

export function validateDhtPong(data: any): ValidationResult {
    if (data.nodeId !== undefined && (typeof data.nodeId !== 'string' || !/^[0-9a-f]+$/i.test(data.nodeId) || data.nodeId.length > 128))
        return { valid: false, error: 'Invalid nodeId' };
    return { valid: true };
}

export function validateSyncPulse(data: any): ValidationResult {
    if (!data.action || typeof data.action !== 'string' || data.action.length > 50)
        return { valid: false, error: 'Invalid action' };
    if (data.deviceId !== undefined && (typeof data.deviceId !== 'string' || data.deviceId.length > 128))
        return { valid: false, error: 'Invalid deviceId' };
    if (data.messageId !== undefined && typeof data.messageId !== 'string')
        return { valid: false, error: 'Invalid messageId' };
    if (data.newContent !== undefined && (typeof data.newContent !== 'string' || data.newContent.length > 50_000))
        return { valid: false, error: 'newContent too large' };
    return { valid: true };
}

export function validateIdentityUpdate(data: any): ValidationResult {
    if (data.alias !== undefined && (typeof data.alias !== 'string' || data.alias.length > 100))
        return { valid: false, error: 'Invalid alias' };
    if (data.avatar !== undefined && (typeof data.avatar !== 'string' || !data.avatar.startsWith('data:image/') || data.avatar.length > 2_000_000))
        return { valid: false, error: 'Invalid avatar' };
    return { valid: true };
}

export function validateFileProposal(data: any): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (!data.fileName || typeof data.fileName !== 'string') return { valid: false, error: 'Invalid fileName' };
    if (typeof data.fileSize !== 'number' || data.fileSize < 0) return { valid: false, error: 'Invalid fileSize' };
    if (typeof data.totalChunks !== 'number' || data.totalChunks <= 0) return { valid: false, error: 'Invalid totalChunks' };
    if (typeof data.chunkSize !== 'number' || data.chunkSize <= 0 || data.chunkSize > 32 * 1024) {
        return { valid: false, error: 'Invalid chunkSize' };
    }
    if (Math.ceil(data.fileSize / data.chunkSize) !== data.totalChunks) {
        return { valid: false, error: 'Inconsistent totalChunks' };
    }
    // BUG DH fix: encryptedKey (NaCl box de 32-byte AES key → 48 bytes ciphertext = 96 hex)
    // y encryptedKeyNonce (NaCl nonce de 24 bytes = 48 hex) no tenían límite de longitud.
    // Buffer.from(data.encryptedKey, 'hex') en handleProposal asignaba hasta 5MB
    // por cualquier peer antes de que crypto_box_open_easy rechazara el MAC inválido.
    if (data.encryptedKey !== undefined &&
        (typeof data.encryptedKey !== 'string' || data.encryptedKey.length !== 96)) {
        return { valid: false, error: 'Invalid encryptedKey (expected 96 hex chars)' };
    }
    if (data.encryptedKeyNonce !== undefined &&
        (typeof data.encryptedKeyNonce !== 'string' || data.encryptedKeyNonce.length !== 48)) {
        return { valid: false, error: 'Invalid encryptedKeyNonce (expected 48 hex chars)' };
    }
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
    if (data.data.length > 50_000) return { valid: false, error: 'Chunk data too large' };
    if (data.chunkHash !== undefined && (typeof data.chunkHash !== 'string' || !/^[a-f0-9]{64}$/i.test(data.chunkHash))) {
        return { valid: false, error: 'Invalid chunkHash' };
    }
    // BUG DI fix: iv (AES-GCM nonce 12 bytes → 24 hex chars) y tag (auth tag 16 bytes → 32 hex
    // chars) sin validar longitud → decryptChunk() llama Buffer.from(iv, 'hex') que asigna
    // memoria arbitraria antes de que Node.js rechace el IV de tamaño incorrecto en createDecipheriv.
    if (data.iv !== undefined &&
        (typeof data.iv !== 'string' || data.iv.length !== 24)) {
        return { valid: false, error: 'Invalid AES-GCM IV (expected 24 hex chars)' };
    }
    if (data.tag !== undefined &&
        (typeof data.tag !== 'string' || data.tag.length !== 32)) {
        return { valid: false, error: 'Invalid AES-GCM tag (expected 32 hex chars)' };
    }
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

export function validateVaultStore(data: any): ValidationResult {
    // BUG DN fix: payloadHash sin límite → DB bloat (campo UNIQUE, se inserta tal cual).
    // CID legítimo máximo: "shard:<64hex>:<2digits>" = ~78 chars. Hash normal = 64 chars.
    // Límite conservador: 200 chars.
    if (!data.payloadHash || typeof data.payloadHash !== 'string' || data.payloadHash.length > 200) return { valid: false, error: 'Invalid payloadHash' };
    // BUG DN fix: recipientSid sin límite → DB bloat. ID legítimo = 32 chars; '*' = 1 char.
    if (!data.recipientSid || typeof data.recipientSid !== 'string' || data.recipientSid.length > 64) return { valid: false, error: 'Invalid recipientSid' };
    if (!data.data || typeof data.data !== 'string') return { valid: false, error: 'Invalid data' };
    if (data.data.length > 150_000) return { valid: false, error: 'Vault data too large' };
    return { valid: true };
}

export function validateVaultQuery(data: any): ValidationResult {
    // BUG DN fix: requesterSid sin límite → comparación con string enorme. ID = 32 chars.
    if (!data.requesterSid || typeof data.requesterSid !== 'string' || data.requesterSid.length > 64) return { valid: false, error: 'Invalid requesterSid' };
    return { valid: true };
}

export function validateVaultAck(data: any): ValidationResult {
    if (!Array.isArray(data.payloadHashes)) return { valid: false, error: 'Invalid payloadHashes' };
    if (data.payloadHashes.length > 200) return { valid: false, error: 'Too many payloadHashes' };
    // BUG DN fix: cada hash sin límite → busca en DB con string enorme.
    for (const h of data.payloadHashes) {
        if (typeof h !== 'string' || h.length > 200) return { valid: false, error: 'Invalid payloadHash in payloadHashes' };
    }
    return { valid: true };
}

export function validateVaultDelivery(data: any): ValidationResult {
    if (!Array.isArray(data.entries)) return { valid: false, error: 'Invalid entries' };
    // Límite de entradas por respuesta (alineado con VAULT_DELIVERY_PAGE_SIZE=50)
    if (data.entries.length > 100) return { valid: false, error: 'Too many vault entries' };
    // BUG FL fix: sin validación de campos individuales de cada entry, un custodio
    // malicioso puede enviar entries con campos null/object en lugar de string,
    // provocando que entry.payloadHash.startsWith() o Buffer.from(entry.data, 'hex')
    // lancen excepciones no controladas en handleVaultDelivery.
    for (const entry of data.entries) {
        if (!entry || typeof entry !== 'object') return { valid: false, error: 'Invalid vault entry' };
        if (typeof entry.senderSid !== 'string' || entry.senderSid.length > 128) {
            return { valid: false, error: 'Invalid vault entry senderSid' };
        }
        if (typeof entry.payloadHash !== 'string' || entry.payloadHash.length > 200) {
            return { valid: false, error: 'Invalid vault entry payloadHash' };
        }
        if (typeof entry.data !== 'string' || entry.data.length > 20_000_000) {
            return { valid: false, error: 'Invalid vault entry data' };
        }
    }
    return { valid: true };
}

export function validateVaultRenew(data: any): ValidationResult {
    if (!data.payloadHash || typeof data.payloadHash !== 'string' || data.payloadHash.length !== 64) {
        return { valid: false, error: 'Invalid payloadHash' };
    }
    if (typeof data.newExpiresAt !== 'number' || data.newExpiresAt < 0) {
        return { valid: false, error: 'Invalid newExpiresAt' };
    }
    return { valid: true };
}

export function validateGroupMsg(data: any): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    if (!data.content || typeof data.content !== 'string' || data.content.length > 200_000) {
        return { valid: false, error: 'Invalid or missing content' };
    }
    // BUG FQ fix: data.id no se validaba. Un peer puede omitirlo (crypto.randomUUID() lo genera)
    // o enviarlo como string arbitrario largo que queda almacenado como PK en messages.
    if (data.id !== undefined && (typeof data.id !== 'string' || data.id.length > 100)) {
        return { valid: false, error: 'Invalid message id' };
    }
    // BUG FR fix: data.replyTo no se validaba (validateChat sí lo hace para CHAT).
    // Un peer puede enviar replyTo como objeto o string de 200 000 chars.
    if (data.replyTo !== undefined && (typeof data.replyTo !== 'string' || data.replyTo.length > 100)) {
        return { valid: false, error: 'Invalid replyTo' };
    }
    return { valid: true };
}

export function validateGroupAck(data: any): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid id' };
    }
    if (!data.groupId || typeof data.groupId !== 'string') {
        return { valid: false, error: 'Invalid groupId' };
    }
    return { valid: true };
}

export function validateGroupInvite(data: any): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    if (!data.payload || typeof data.payload !== 'string') {
        return { valid: false, error: 'Missing encrypted payload' };
    }
    // BUG AI fix: sin límite, un admin podría embeber avatares de varios MB
    // en el payload cifrado de GROUP_INVITE/UPDATE y los miembros los almacenarían
    // todos en SQLite. 500,000 chars hex ≈ 250KB cifrado ≈ 230KB avatar real.
    if (data.payload.length > 500_000) {
        return { valid: false, error: 'Group invite payload too large' };
    }
    if (!data.nonce || typeof data.nonce !== 'string' || data.nonce.length !== 48) {
        return { valid: false, error: 'Invalid nonce' };
    }
    return { valid: true };
}

export function validateGroupUpdate(data: any): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    if (!data.payload || typeof data.payload !== 'string') {
        return { valid: false, error: 'Missing encrypted payload' };
    }
    // BUG AI fix: mismo límite que validateGroupInvite.
    if (data.payload.length > 500_000) {
        return { valid: false, error: 'Group update payload too large' };
    }
    if (!data.nonce || typeof data.nonce !== 'string' || data.nonce.length !== 48) {
        return { valid: false, error: 'Invalid nonce' };
    }
    return { valid: true };
}

export function validateChatContact(data: any): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid id' };
    }
    if (!isValidHexId(data.upeerId)) {
        return { valid: false, error: 'Invalid upeerId' };
    }
    if (data.contactName && (typeof data.contactName !== 'string' || data.contactName.length > 100)) {
        return { valid: false, error: 'Invalid contactName' };
    }
    if (data.contactAddress && typeof data.contactAddress !== 'string') {
        return { valid: false, error: 'Invalid contactAddress' };
    }
    if (!data.contactPublicKey || typeof data.contactPublicKey !== 'string' || data.contactPublicKey.length !== 64) {
        return { valid: false, error: 'Invalid contactPublicKey' };
    }
    return { valid: true };
}

export function validateGroupLeave(data: any): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    // BUG DD fix: misma vulnerabilidad que validateChatDelete — firma interior sin límite.
    // Ed25519 signature = 64 bytes = 128 hex chars; cualquier otra longitud es inválida.
    if (data.signature !== undefined &&
        (typeof data.signature !== 'string' || data.signature.length !== 128)) {
        return { valid: false, error: 'Invalid signature (expected 128 hex chars)' };
    }
    return { valid: true };
}

export function validateReputationGossip(data: any): ValidationResult {
    if (!Array.isArray(data.ids)) return { valid: false, error: 'ids debe ser un array' };
    if (data.ids.length > 500) return { valid: false, error: 'Demasiados IDs' };
    for (const id of data.ids) {
        if (!isValidHexId(id)) return { valid: false, error: 'ID de vouch inválido' };
    }
    return { valid: true };
}

export function validateReputationRequest(data: any): ValidationResult {
    if (!Array.isArray(data.missing)) return { valid: false, error: 'missing debe ser un array' };
    if (data.missing.length > 100) return { valid: false, error: 'Demasiados IDs faltantes' };
    for (const id of data.missing) {
        if (!isValidHexId(id)) return { valid: false, error: 'ID de vouch inválido' };
    }
    return { valid: true };
}

export function validateReputationDeliver(data: any): ValidationResult {
    if (!Array.isArray(data.vouches)) return { valid: false, error: 'vouches debe ser un array' };
    if (data.vouches.length > 50) return { valid: false, error: 'Demasiados vouches' };
    for (const v of data.vouches) {
        if (!isValidHexId(v.id)) return { valid: false, error: 'id inválido' };
        if (!isValidHexId(v.fromId)) return { valid: false, error: 'fromId inválido' };
        if (!isValidHexId(v.toId)) return { valid: false, error: 'toId inválido' };
        if (!v.type || typeof v.type !== 'string') return { valid: false, error: 'type inválido' };
        if (typeof v.timestamp !== 'number') return { valid: false, error: 'timestamp inválido' };
        if (!v.signature || typeof v.signature !== 'string' || v.signature.length !== 128) return { valid: false, error: 'signature inválida' };
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
        case 'CHAT_CONTACT':
            return validateChatContact(data);
        case 'CHAT_REACTION':
            return validateChatReaction(data);
        case 'CHAT_UPDATE':
            return validateChatUpdate(data);
        case 'CHAT_DELETE':
            return validateChatDelete(data);
        case 'CHAT_CLEAR_ALL':
            return validateChatClear(data);
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
        case 'DHT_STORE_ACK':
            return validateDhtStoreAck(data);
        case 'DHT_FOUND_NODES':
            return validateDhtFoundNodes(data);
        case 'DHT_FOUND_VALUE':
            return validateDhtFoundValue(data);
        case 'DHT_PING':
            return validateDhtPing(data);
        case 'DHT_PONG':
            return validateDhtPong(data);
        case 'SYNC_PULSE':
            return validateSyncPulse(data);
        case 'IDENTITY_UPDATE':
            return validateIdentityUpdate(data);
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
        case 'FILE_DONE':
        case 'FILE_DONE_ACK':
        case 'FILE_END':
            return validateFileDoneAck(data);
        case 'FILE_CANCEL':
            return validateFileCancel(data);
        case 'VAULT_STORE':
            return validateVaultStore(data);
        case 'VAULT_QUERY':
            return validateVaultQuery(data);
        case 'VAULT_ACK':
            return validateVaultAck(data);
        case 'VAULT_DELIVERY':
            return validateVaultDelivery(data);
        // BUG Z fix: VAULT_RENEW nunca fue añadido al switch →
        // todos los paquetes VAULT_RENEW eran rechazados por el default,
        // rompiendo completamente el ciclo de renovación de 60 días.
        case 'VAULT_RENEW':
            return validateVaultRenew(data);
        // BUG Z fix: GROUP_MSG/ACK/INVITE/UPDATE/LEAVE tampoco estaban →
        // los mensajes de grupo nunca llegaban a sus handlers.
        case 'GROUP_MSG':
            return validateGroupMsg(data);
        case 'GROUP_ACK':
            return validateGroupAck(data);
        case 'GROUP_INVITE':
            return validateGroupInvite(data);
        case 'GROUP_UPDATE':
            return validateGroupUpdate(data);
        case 'GROUP_LEAVE':
            return validateGroupLeave(data);
        case 'REPUTATION_GOSSIP':
            return validateReputationGossip(data);
        case 'REPUTATION_REQUEST':
            return validateReputationRequest(data);
        case 'REPUTATION_DELIVER':
            return validateReputationDeliver(data);
        case 'DR_RESET': {
            if (data.signedPreKey !== undefined && data.signedPreKey !== null) {
                const spk = data.signedPreKey;
                if (typeof spk !== 'object') return { valid: false, error: 'signedPreKey must be an object' };
                if (spk.spkPub !== undefined && (typeof spk.spkPub !== 'string' || spk.spkPub.length !== 64))
                    return { valid: false, error: 'Invalid signedPreKey.spkPub' };
                if (spk.spkSig !== undefined && (typeof spk.spkSig !== 'string' || spk.spkSig.length !== 128))
                    return { valid: false, error: 'Invalid signedPreKey.spkSig' };
                if (spk.spkId !== undefined && (typeof spk.spkId !== 'number' || !Number.isInteger(spk.spkId) || spk.spkId < 0))
                    return { valid: false, error: 'Invalid signedPreKey.spkId' };
            }
            return { valid: true };
        }
        default:
            // Unknown message type - reject
            return { valid: false, error: `Unknown message type: ${type}` };
    }
}