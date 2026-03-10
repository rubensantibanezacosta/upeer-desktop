import os from 'node:os';
import crypto from 'node:crypto';
import { getMyUPeerId, sign, verify, getMyAlias } from '../security/identity.js';
import { getKademliaInstance } from './dht/shared.js';
import { getYggstackAddress } from '../sidecars/yggstack.js';
import { network, warn, error } from '../security/secure-logger.js';
import type { RenewalToken } from './types.js';

// TTL for location blocks (contact tokens) - Resiliencia extrema
const DAY_MS = 24 * 60 * 60 * 1000;
export const LOCATION_BLOCK_TTL_MS = 30 * DAY_MS; // 30 días
// Máximo permitido (para renewal tokens de 60 días)
export const LOCATION_BLOCK_TTL_MAX = 60 * DAY_MS; // 60 días máximo permitido con renewal tokens
export const LOCATION_BLOCK_REFRESH_MS = 1 * DAY_MS; // Refresco cada 24h
// Renewal token configuration
export const RENEWAL_TOKEN_ALLOWED_UNTIL_MS = 60 * DAY_MS; // 60 días
// Tiempo antes de expiración para activar renovación automática (3 días)
export const AUTO_RENEW_THRESHOLD_MS = 3 * DAY_MS;

/**
 * Ensures JSON keys are always in the same order for consistent signatures.
 */
export function canonicalStringify(obj: any): string {
    const allKeys = Object.keys(obj).sort();
    return JSON.stringify(obj, allKeys);
}

export function generateSignedLocationBlock(address: string, dhtSeq: number, ttlMs?: number, renewalToken?: RenewalToken) {
    const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
    // Cap TTL to maximum allowed
    const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
    const expiresAt = Date.now() + cappedTtl;

    // Generate renewal token if not provided (for extreme resilience)
    const finalRenewalToken = renewalToken || generateRenewalToken(getMyUPeerId(), 3);

    // Signature includes upeerId, address, dhtSeq, expiresAt (for backward compatibility)
    const data = { upeerId: getMyUPeerId(), address, dhtSeq, expiresAt };
    const sig = sign(Buffer.from(canonicalStringify(data))).toString('hex');
    // Include renewalToken and alias as optional extra fields (not part of signature)
    return { address, dhtSeq, expiresAt, signature: sig, renewalToken: finalRenewalToken, alias: getMyAlias() || undefined };
}



/**
 * Generate a renewal token that allows other nodes to renew location blocks
 */


/**
 * Verify a renewal token's signature and validity
 */


export function verifyLocationBlock(upeerId: string, block: { address: string, dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken }, publicKeyHex: string): boolean {
    // First check if block is expired
    if (block.expiresAt !== undefined && block.expiresAt < Date.now()) {
        // Check if we can renew it with renewal token
        if (block.renewalToken && canRenewLocationBlock(block, publicKeyHex)) {
            // Auto-renew expired block if renewal token is valid
            return true; // Allow renewal
        }
        return false; // Expired and cannot renew
    }
    // Try verification with expiresAt if present
    if (block.expiresAt !== undefined) {
        const dataWithExpires = { upeerId, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
        const validWithExpires = verify(
            Buffer.from(canonicalStringify(dataWithExpires)),
            Buffer.from(block.signature, 'hex'),
            Buffer.from(publicKeyHex, 'hex')
        );
        if (validWithExpires) {
            // Check if expired
            if (block.expiresAt < Date.now()) {
                return false; // Expired
            }
            // Verify renewal token if present
            if (block.renewalToken) {
                if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
                    return false; // Invalid renewal token
                }
            }
            return true;
        }
        // If signature with expiresAt fails, maybe it was signed without expiresAt
        // Fall through to try without expiresAt
    }

    // Try verification without expiresAt (for backward compatibility)
    const dataWithoutExpires = { upeerId, address: block.address, dhtSeq: block.dhtSeq };
    const validWithoutExpires = verify(
        Buffer.from(canonicalStringify(dataWithoutExpires)),
        Buffer.from(block.signature, 'hex'),
        Buffer.from(publicKeyHex, 'hex')
    );

    // If block has expiresAt but signature doesn't include it, we still accept it
    // but enforce expiration if expiresAt is in the past
    if (validWithoutExpires && block.expiresAt !== undefined) {
        if (block.expiresAt < Date.now()) {
            return false; // Expired
        }
        // Verify renewal token if present
        if (block.renewalToken) {
            if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
                return false; // Invalid renewal token
            }
        }
    }

    return validWithoutExpires;
}



/**
 * Generate a renewal token that allows other nodes to renew location blocks
 */
/**
 * Verify a location block with DHT fallback for renewal tokens
 * This is the async version that can search for tokens in the DHT
 */
export async function verifyLocationBlockWithDHT(
    upeerId: string,
    block: { address: string, dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken },
    publicKeyHex: string
): Promise<boolean> {
    // First check if block is expired
    if (block.expiresAt !== undefined && block.expiresAt < Date.now()) {
        // Check if we can renew it with renewal token (local or DHT)
        if (block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex)) {
            // Auto-renew expired block if renewal token is valid
            return true; // Allow renewal
        }
        // Try to find renewal token in DHT
        const dhtToken = await findRenewalTokenInDHT(upeerId);
        if (dhtToken && verifyRenewalToken(dhtToken, publicKeyHex)) {
            // Auto-renew with DHT token
            return true;
        }
        return false; // Expired and cannot renew
    }

    // Try verification with expiresAt if present
    if (block.expiresAt !== undefined) {
        const dataWithExpires = { upeerId, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
        const validWithExpires = verify(
            Buffer.from(canonicalStringify(dataWithExpires)),
            Buffer.from(block.signature, 'hex'),
            Buffer.from(publicKeyHex, 'hex')
        );
        if (validWithExpires) {
            // Check if expired
            if (block.expiresAt < Date.now()) {
                return false; // Expired
            }
            // Verify renewal token if present
            if (block.renewalToken) {
                if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
                    return false; // Invalid renewal token
                }
            }
            return true;
        }
        // If signature with expiresAt fails, fall through
    }

    // Try verification without expiresAt (for backward compatibility)
    const dataWithoutExpires = { upeerId, address: block.address, dhtSeq: block.dhtSeq };
    const validWithoutExpires = verify(
        Buffer.from(canonicalStringify(dataWithoutExpires)),
        Buffer.from(block.signature, 'hex'),
        Buffer.from(publicKeyHex, 'hex')
    );

    if (validWithoutExpires && block.expiresAt !== undefined) {
        if (block.expiresAt < Date.now()) {
            return false; // Expired
        }
        // Verify renewal token if present
        if (block.renewalToken) {
            if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
                return false; // Invalid renewal token
            }
        }
    }

    return validWithoutExpires;
}

export function generateRenewalToken(targetId: string, maxRenewals = 3): RenewalToken {
    const allowedUntil = Date.now() + RENEWAL_TOKEN_ALLOWED_UNTIL_MS;
    // BUG AF fix: renewalsUsed es mutable (se incrementa en cada renovación por
    // cualquier peer de la red). Incluirlo en la firma hace que la firma quede
    // inválida tras el primer renewal (0→1), rompiendo todas las renovaciones
    // posteriores. Solo se firman los campos estáticos que Alice controla.
    const signedData = { targetId, allowedUntil, maxRenewals };
    const signature = sign(Buffer.from(canonicalStringify(signedData))).toString('hex');
    return { targetId, allowedUntil, maxRenewals, renewalsUsed: 0, signature };
}

/**
 * Check if a location block can be renewed
 */
export function canRenewLocationBlock(block: { expiresAt?: number, renewalToken?: RenewalToken }, publicKeyHex: string): boolean {
    if (!block.renewalToken) return false;

    // Check if block is near expiration (within auto-renew threshold)
    const now = Date.now();
    const expiresAt = block.expiresAt || now;
    const timeUntilExpiry = expiresAt - now;

    // Only renew if block is expired or about to expire
    if (timeUntilExpiry > AUTO_RENEW_THRESHOLD_MS && timeUntilExpiry > 0) {
        return false; // Not yet ready for renewal
    }

    return verifyRenewalToken(block.renewalToken, publicKeyHex);
}

/**
 * Renew a location block using its renewal token
 */
export function renewLocationBlock(block: { address: string, dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken }, publicKeyHex: string): { address: string, dhtSeq: number, expiresAt: number, signature: string, renewalToken?: RenewalToken } | null {
    if (!canRenewLocationBlock(block, publicKeyHex) || !block.renewalToken) {
        return null;
    }

    // Increment renewals used
    const renewedToken = {
        ...block.renewalToken,
        renewalsUsed: (block.renewalToken.renewalsUsed || 0) + 1
    };

    // BUG BY fix: NO cambiar expiresAt. El bloque moderno firma
    // { upeerId, address, dhtSeq, expiresAt }, por lo que modificar
    // expiresAt invalida la firma original y hace el bloque irrecuperable:
    // - La ruta con-expiresAt falla (nuevo expiresAt ≠ expiresAt firmado)
    // - La ruta sin-expiresAt también falla (la firma original lo incluía)
    // La renovación solo incrementa renewalsUsed en el token.
    // Cuando el bloque expire (expiresAt < Date.now()), verifyLocationBlock
    // acepta bloques caducados con renewalToken válido mediante el atajo de
    // la parte superior de la función, sin necesidad de re-firmar.
    const renewedBlock = {
        address: block.address,
        dhtSeq: block.dhtSeq,
        // Conservar expiresAt original (está dentro de la firma del bloque).
        // Si es undefined (bloque antiguo sin expiresAt firmado), usar 0 como
        // fallback: 0 = muy expirado → verifyLocationBlock activará el atajo
        // de renewalToken en lugar del camino normal de verificación de firma.
        expiresAt: block.expiresAt ?? 0,
        signature: block.signature,
        renewalToken: renewedToken
    };

    return renewedBlock;
}

/**
 * Verify a renewal token's signature and validity
 */
export function verifyRenewalToken(token: RenewalToken, publicKeyHex: string): boolean {
    // Check if token is still valid (within allowedUntil)
    if (token.allowedUntil < Date.now()) {
        return false; // Token expired
    }
    // Check if maxRenewals not exceeded
    if (token.renewalsUsed >= token.maxRenewals) {
        return false; // All renewals used
    }
    // BUG AF fix: excluir renewalsUsed de la verificación de firma.
    // renewalsUsed es incrementado por peers de la red que no tienen la clave
    // privada de Alice, por lo que nunca puede ser re-firmado. Incluyéndolo
    // la verición fallaba después del primer renewal (0→1).
    // La protección real contra renovaciones infinitas es allowedUntil (60 días).
    const { signature, renewalsUsed, ...signedData } = token;
    const isValid = verify(
        Buffer.from(canonicalStringify(signedData)),
        Buffer.from(signature, 'hex'),
        Buffer.from(publicKeyHex, 'hex')
    );
    return isValid;
}

/**
 * Generate a location block with optional renewal token
 * BUG BI fix: la versión anterior incluía `renewalToken` en los datos firmados,
 * pero verifyLocationBlock/verifyLocationBlockWithDHT nunca prueban ese formato
 * (solo prueban con/sin expiresAt). Cualquier bloque generado por esta función
 * era irrecuperable: la firma siempre fallaba en el receptor.
 * Ahora usa el mismo formato de firma que generateSignedLocationBlock.
 */
export function generateSignedLocationBlockWithRenewal(address: string, dhtSeq: number, ttlMs?: number, renewalToken?: RenewalToken) {
    const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
    const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
    const expiresAt = Date.now() + cappedTtl;

    // Firmar SIN renewalToken (idéntico a generateSignedLocationBlock) para que
    // verifyLocationBlock pueda verificar el bloque correctamente.
    const data = { upeerId: getMyUPeerId(), address, dhtSeq, expiresAt };
    const sig = sign(Buffer.from(canonicalStringify(data))).toString('hex');
    return { address, dhtSeq, expiresAt, renewalToken, signature: sig };
}

// Maximum allowed jump in DHT sequence numbers without PoW
export const MAX_DHT_SEQ_JUMP = 1000;

/**
 * Validate DHT sequence number jump
 * @param currentSeq Current sequence number
 * @param newSeq Incoming sequence number
 * @returns true if jump is acceptable
 */
export function validateDhtSequence(currentSeq: number, newSeq: number): {
    valid: boolean;
    requiresPoW: boolean;
    reason?: string;
} {
    if (newSeq <= currentSeq) {
        return { valid: false, requiresPoW: false, reason: 'Sequence not increasing' };
    }

    const jump = newSeq - currentSeq;
    if (jump > MAX_DHT_SEQ_JUMP) {
        return { valid: false, requiresPoW: true, reason: `Sequence jump too large: ${jump} > ${MAX_DHT_SEQ_JUMP}` };
    }

    return { valid: true, requiresPoW: false };
}

export function getNetworkAddress() {
    // Primario: dirección del sidecar yggstack en user-space (sin TUN/TAP, sin root).
    // Se rellena en cuanto yggstack reporta su IPv6 al arranque.
    const yggAddr = getYggstackAddress();
    if (yggAddr) return yggAddr;

    // Fallback: escanear interfaces de red físicas (útil con TUN clásico en dev/CI
    // o si yggstack aún no ha detectado su dirección).
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.includes('ygg') || name === 'utun2' || name === 'tun0') {
            for (const net of interfaces[name] || []) {
                const family = net.family;
                const isIPv6 = (family as unknown) === 'IPv6' || (family as unknown) === 6;
                if (isIPv6 && (net.address.startsWith('200:') || net.address.startsWith('201:'))) {
                    return net.address;
                }
            }
        }
    }
    return null;
}

/**
 * Create a DHT key for a renewal token
 * Key format: SHA256("renewal:" + targetId + ":" + signaturePrefix)
 */
export function createRenewalTokenKey(targetId: string, signaturePrefix?: string): Buffer {
    const hash = crypto.createHash('sha256');
    const sigPart = signaturePrefix ? signaturePrefix.substring(0, 16) : '';
    hash.update(`renewal:${targetId}:${sigPart}`);
    return hash.digest();
}

/**
 * Store a renewal token in the DHT for distributed access
 */
// BUG BK fix: usar el secure logger en lugar de console.warn/log/error.
export async function storeRenewalTokenInDHT(token: RenewalToken): Promise<boolean> {
    const kademlia = getKademliaInstance();
    if (!kademlia) {
        warn('Kademlia DHT not available for storing renewal token', {}, 'dht-renewal');
        return false;
    }

    // Create key for token
    const key = createRenewalTokenKey(token.targetId, token.signature);
    try {
        await kademlia.storeValue(key, token, token.targetId, token.signature);
        network('Stored renewal token in DHT', undefined, { targetId: token.targetId }, 'dht-renewal');
        return true;
    } catch (err) {
        error('Failed to store renewal token in DHT', err, 'dht-renewal');
        return false;
    }
}

/**
 * Find renewal tokens for a targetId in the DHT
 * If tokenSignature is provided, tries to find specific token
 */
export async function findRenewalTokenInDHT(targetId: string, tokenSignature?: string): Promise<RenewalToken | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) {
        warn('Kademlia DHT not available for finding renewal token', {}, 'dht-renewal');
        return null;
    }

    // If we have signature, look for specific token
    // Otherwise, find any token for this targetId (first one)
    const key = createRenewalTokenKey(targetId, tokenSignature || '');
    try {
        const result = await kademlia.findValue(key);
        if (result && result.value) {
            network('Found renewal token in DHT', undefined, { targetId }, 'dht-renewal');
            return result.value as RenewalToken;
        }
    } catch (err) {
        error('Failed to find renewal token in DHT', err, 'dht-renewal');
    }
    return null;
}

/**
 * Enhanced canRenewLocationBlock that checks DHT if no local token available
 */
export async function canRenewLocationBlockWithDHT(
    block: { expiresAt?: number, renewalToken?: RenewalToken },
    publicKeyHex: string,
    targetId: string
): Promise<boolean> {
    // First check local token
    if (block.renewalToken) {
        return verifyRenewalToken(block.renewalToken, publicKeyHex);
    }

    // If no local token, try to find one in DHT
    const token = await findRenewalTokenInDHT(targetId);
    if (!token) {
        return false;
    }

    // Verify the found token
    return verifyRenewalToken(token, publicKeyHex);
}

/**
 * Enhanced renewLocationBlock that can use DHT tokens
 */
export async function renewLocationBlockWithDHT(
    block: { address: string, dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken },
    publicKeyHex: string,
    targetId: string
): Promise<{ address: string, dhtSeq: number, expiresAt: number, signature: string, renewalToken?: RenewalToken } | null> {
    // Try local token first
    if (block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex)) {
        return renewLocationBlock(block, publicKeyHex);
    }

    // Try to find token in DHT
    const token = await findRenewalTokenInDHT(targetId);
    if (!token) {
        return null;
    }

    // Verify DHT token
    if (!verifyRenewalToken(token, publicKeyHex)) {
        return null;
    }

    // Create renewed token with incremented renewalsUsed
    const renewedToken = {
        ...token,
        renewalsUsed: (token.renewalsUsed || 0) + 1
    };

    // BUG BY fix: conservar expiresAt original (está en la firma del bloque).
    // Ver comentario en renewLocationBlock para la explicación completa.
    const renewedBlock = {
        address: block.address,
        dhtSeq: block.dhtSeq,
        expiresAt: block.expiresAt ?? 0, // Conservar expiresAt original (ver renewLocationBlock)
        signature: block.signature,
        renewalToken: renewedToken
    };

    return renewedBlock;
}

