import os from 'node:os';
import crypto from 'node:crypto';
import { getMyUPeerId, sign, verify, getMyAlias, getMyDeviceId } from '../security/identity.js';
import { getKademliaInstance } from './dht/shared.js';
import { getYggstackAddress } from '../sidecars/yggstack.js';
import { network, warn, error, debug } from '../security/secure-logger.js';
import type { RenewalToken, DeviceMetadata } from './types.js';

const YGG_ADDR_REGEX = /^[23][0-9a-f]{2}:/i;

export function isYggdrasilAddress(address: string): boolean {
    return YGG_ADDR_REGEX.test(address) && address.split(':').length === 8;
}

/**
 * Validation utility for IP addresses (IPv4 or IPv6/Yggdrasil).
 */
export function validateAddress(address: string): void {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ipv4Regex.test(address) && !ipv6Regex.test(address)) {
        throw new Error(`Invalid network address format: ${address}`);
    }
    // Deep IPv4 check for octets > 255
    if (ipv4Regex.test(address)) {
        const octets = address.split('.').map(Number);
        if (octets.some(o => o > 255)) {
            throw new Error(`Invalid IPv4 address: octet > 255 in ${address}`);
        }
    }
}

/**
 * Prioritizes Yggdrasil/IPv6 addresses over IPv4 for sorting.
 * This ensures Yggdrasil is used as the 'primary' address in legacy fields.
 */
/**
 * Sorts an array of IP addresses prioritizing Yggdrasil (200::/7) addresses.
 */
export function prioritizeYggdrasil(a: string, b: string): number {
    const isAYgg = a.startsWith('2') || a.startsWith('3') || a.includes(':');
    const isBYgg = b.startsWith('2') || b.startsWith('3') || b.includes(':');

    if (isAYgg && !isBYgg) return -1;
    if (!isAYgg && isBYgg) return 1;
    return a.localeCompare(b);
}

/**
 * Validation utility for hex strings to prevent malformed buffer creation.
 */
export function validateHex(hex: string, description: string): void {
    if (typeof hex !== 'string' || !/^[0-9a-f]*$/i.test(hex)) {
        throw new Error(`Invalid hex string for ${description}`);
    }
}

/**
 * Safe conversion from hex to Buffer with validation.
 */
export function safeBufferFromHex(hex: string, expectedLength?: number, description = 'buffer'): Buffer {
    validateHex(hex, description);
    if (expectedLength !== undefined && hex.length !== expectedLength * 2) {
        throw new Error(`Invalid length for ${description}: expected ${expectedLength} bytes, got ${hex.length / 2}`);
    }
    return Buffer.from(hex, 'hex');
}

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
 * Recursive version to match Python's sort_keys=True.
 */
export function canonicalStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        if (Array.isArray(obj)) {
            return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
        }
        return JSON.stringify(obj);
    }
    const allKeys = Object.keys(obj).sort();
    const parts = allKeys.map(key => {
        const val = obj[key];
        if (val === undefined) return null;
        return JSON.stringify(key) + ':' + canonicalStringify(val);
    }).filter(p => p !== null);
    return '{' + parts.join(',') + '}';
}

export function generateSignedLocationBlock(addressOrAddresses: string | string[], dhtSeq: number, ttlMs?: number, renewalToken?: RenewalToken, deviceMeta?: DeviceMetadata) {
    const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
    // Cap TTL to maximum allowed
    const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
    const expiresAt = Date.now() + cappedTtl;

    const addresses = Array.isArray(addressOrAddresses) ? addressOrAddresses : [addressOrAddresses];
    // Security: Validation & Deterministic sorting (Prioritizing Yggdrasil)
    addresses.forEach(addr => validateAddress(addr));
    const sortedAddresses = [...new Set(addresses)].sort(prioritizeYggdrasil);

    // Generate renewal token if not provided (for extreme resilience)
    const finalRenewalToken = renewalToken || generateRenewalToken(getMyUPeerId(), 3);

    const deviceId = getMyDeviceId();

    // Signature includes upeerId, addresses (plural), dhtSeq, expiresAt, deviceId, deviceMeta
    // Note: deviceMeta is part of the signed data to ensure integrity
    const data: any = { upeerId: getMyUPeerId(), addresses: sortedAddresses, dhtSeq, expiresAt, deviceId };
    if (deviceMeta) data.deviceMeta = deviceMeta;

    const sig = sign(Buffer.from(canonicalStringify(data))).toString('hex');

    // For backward compatibility in object keys, we keep 'address' as the primary one (first)
    // Thanks to prioritizeYggdrasil, addresses[0] will be Yggdrasil if available.
    return {
        address: sortedAddresses[0],
        addresses: sortedAddresses,
        dhtSeq,
        expiresAt,
        signature: sig,
        renewalToken: finalRenewalToken,
        alias: getMyAlias() || undefined,
        deviceId,
        deviceMeta
    };
}



/**
 * Generate a renewal token that allows other nodes to renew location blocks
 */


/**
 * Verify a renewal token's signature and validity
 */


export function verifyLocationBlock(upeerId: string, block: { address: string, addresses?: string[], dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken, deviceId?: string, deviceMeta?: DeviceMetadata }, publicKeyHex: string): boolean {
    // Audit Note: Removed legacy fallbacks for blocks without expiresAt.
    // Modern protocol requires expiresAt and consistent canonical serialization.

    if (block.expiresAt === undefined) {
        warn('Rejected legacy location block (missing expiresAt)', { upeerId }, 'dht');
        return false;
    }

    // First check if block is expired
    if (block.expiresAt < Date.now()) {
        // Un bloque expirado no es válido para su uso normal, incluso si tiene
        // un renewalToken (que sirve para pedir uno nuevo, no para validar el viejo).
        return false;
    }

    try {
        // Multi-channel support: use 'addresses' if present, fallback to 'address'
        const inputAddresses = block.addresses || [block.address];
        const sortedAddresses = [...new Set(inputAddresses)].sort(prioritizeYggdrasil);
        sortedAddresses.forEach(addr => validateAddress(addr));

        // Attempt verification with the modern 'addresses' array and new metadata
        const data: any = { upeerId, addresses: sortedAddresses, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
        if (block.deviceId) data.deviceId = block.deviceId;
        if (block.deviceMeta) data.deviceMeta = block.deviceMeta;

        let isValid = verify(
            Buffer.from(canonicalStringify(data)),
            safeBufferFromHex(block.signature, 64, 'signature'),
            safeBufferFromHex(publicKeyHex, 32, 'publicKey')
        );

        if (!isValid) {
            // Check if it's a block with device metadata but without it in the signature (unlikely in new versions)
            // or if it's a legacy block without device metadata at all.
            if (!block.deviceId && !block.deviceMeta) {
                // Backward compatibility fallback: try verifying with single 'address' field
                const legacyData = { upeerId, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
                isValid = verify(
                    Buffer.from(canonicalStringify(legacyData)),
                    safeBufferFromHex(block.signature, 64, 'signature'),
                    safeBufferFromHex(publicKeyHex, 32, 'publicKey')
                );
            }
        }

        if (isValid && block.renewalToken) {
            if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
                return false;
            }
        }
        return isValid;
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        debug('Location block verification error', { error: errorMsg }, 'dht');
        return false;
    }
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
    block: { address: string, addresses?: string[], dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken },
    publicKeyHex: string
): Promise<boolean> {
    // Pure modern protocol: reject blocks without expiration
    if (block.expiresAt === undefined) return false;

    // First check if block is expired
    if (block.expiresAt < Date.now()) {
        const canRenew = block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex);
        if (canRenew) return true;

        const dhtToken = await findRenewalTokenInDHT(upeerId);
        if (dhtToken && verifyRenewalToken(dhtToken, publicKeyHex)) return true;

        warn('Location block expired and cannot renew', { upeerId, expiresAt: block.expiresAt }, 'dht');
        return false;
    }

    try {
        const inputAddresses = block.addresses || [block.address];
        const sortedAddresses = [...new Set(inputAddresses)].sort(prioritizeYggdrasil);
        sortedAddresses.forEach(addr => validateAddress(addr));

        return verifyLocationBlock(upeerId, block, publicKeyHex);
    } catch (err: any) {
        debug('DHT verification error', { error: err.message }, 'dht');
        return false;
    }
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
    const { signature, renewalsUsed: _renewalsUsed, ...signedData } = token;
    try {
        const isValid = verify(
            Buffer.from(canonicalStringify(signedData)),
            safeBufferFromHex(signature, 64, 'renewalSignature'),
            safeBufferFromHex(publicKeyHex, 32, 'publicKey')
        );
        return isValid;
    } catch (err) {
        return false;
    }
}


// Maximum allowed jump in DHT sequence numbers without PoW (for timestamp-based sequences in ms)
// BUG BG fix: 1000 era 1 segundo — obligaba a PoW en cada actualización tras 1s de inactividad.
// 24 horas es un margen razonable para resincronizar IPs dinámicas sin PoW.
export const MAX_DHT_SEQ_JUMP = 24 * 60 * 60 * 1000; // 24 horas

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
    if (newSeq < currentSeq) {
        return { valid: false, requiresPoW: false, reason: 'Sequence rollback detected' };
    }
    if (newSeq === currentSeq) {
        return { valid: true, requiresPoW: false, reason: 'Sequence identical' };
    }

    // BUG BG fix: permitir salto inicial desde 0 sin PoW (inicialización del nodo).
    if (currentSeq === 0) {
        return { valid: true, requiresPoW: false };
    }

    const jump = newSeq - currentSeq;
    if (jump > MAX_DHT_SEQ_JUMP) {
        return { valid: false, requiresPoW: true, reason: `Sequence jump too large: ${jump} > ${MAX_DHT_SEQ_JUMP}` };
    }

    return { valid: true, requiresPoW: false };
}

/**
 * Support for multi-channel address resolution (LAN + Yggdrasil).
 * Returns all viable addresses for the current node.
 */
export function getNetworkAddresses(): string[] {
    const addresses: string[] = [];

    // 1. Primary: Yggdrasil from sidecar (preferred, zero-config)
    const yggAddr = getYggstackAddress();
    if (yggAddr) addresses.push(yggAddr);

    // 2. Scan physical interfaces for Fallbacks & LAN
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
            if (net.internal) continue;

            const family = net.family;
            const isIPv6 = (family as unknown) === 'IPv6' || (family as unknown) === 6;

            // Yggdrasil check (200::/7 range)
            if (isIPv6 && (net.address.startsWith('200:') || net.address.startsWith('201:'))) {
                if (!addresses.includes(net.address)) addresses.push(net.address);
                continue;
            }

            // LAN Discovery support:
            // - IPv4 (Private ranges typically)
            // - IPv6 Link-Local (fe80::)
            if (!isIPv6) {
                // Simple exclusion of virtual/bridge interfaces to reduce noise
                if (!/^(docker|br-|veth|lo)/.test(name)) {
                    addresses.push(net.address);
                }
            } else if (net.address.startsWith('fe80:')) {
                // Link-local addresses are useful for same-segment LAN discovery
                addresses.push(net.address);
            }
        }
    }

    return [...new Set(addresses)];
}

/**
 * Legacy compatibility wrapper. Returns the first available address.
 * @deprecated Use getNetworkAddresses() for multi-channel support.
 */
export function getNetworkAddress(): string | null {
    const list = getNetworkAddresses();
    return list.length > 0 ? list[0] : null;
}

/**
 * Returns current device technical metadata for location blocks.
 */
export function getDeviceMetadata(): DeviceMetadata {
    return {
        clientName: 'Revelnest Desktop',
        clientVersion: '1.2.0', // TODO: Cargar desde package.json
        platform: os.platform(),
        deviceClass: 'desktop'
    };
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
    block: { address: string, addresses?: string[], dhtSeq: number, signature: string, expiresAt?: number, renewalToken?: RenewalToken },
    publicKeyHex: string,
    targetId: string
): Promise<{ address: string, addresses?: string[], dhtSeq: number, expiresAt: number, signature: string, renewalToken?: RenewalToken } | null> {
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

    // Conservar datos originales
    const renewedBlock = {
        address: block.address,
        addresses: block.addresses, // Conservar lista original de IPs
        dhtSeq: block.dhtSeq,
        expiresAt: block.expiresAt ?? 0, // Conservar expiresAt original
        signature: block.signature,
        renewalToken: renewedToken
    };

    return renewedBlock;
}

