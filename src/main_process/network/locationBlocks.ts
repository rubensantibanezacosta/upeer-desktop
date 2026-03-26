import { getMyUPeerId, sign, verify, getMyAlias, getMyDeviceId } from '../security/identity.js';
import { warn, debug } from '../security/secure-logger.js';
import { validateAddress, prioritizeYggdrasil } from './addressing.js';
import { canonicalStringify, safeBufferFromHex } from './cryptoUtils.js';
import { findRenewalTokenInDHT, generateRenewalToken, verifyRenewalToken } from './renewalTokens.js';
import type { RenewalToken, DeviceMetadata } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const LOCATION_BLOCK_TTL_MS = 30 * DAY_MS;
export const LOCATION_BLOCK_TTL_MAX = 60 * DAY_MS;
export const LOCATION_BLOCK_REFRESH_MS = 1 * DAY_MS;

export function generateSignedLocationBlock(addressOrAddresses: string | string[], dhtSeq: number, ttlMs?: number, renewalToken?: RenewalToken, deviceMeta?: DeviceMetadata) {
    const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
    const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
    const expiresAt = Date.now() + cappedTtl;

    const addresses = Array.isArray(addressOrAddresses) ? addressOrAddresses : [addressOrAddresses];
    addresses.forEach(addr => validateAddress(addr));
    const sortedAddresses = [...new Set(addresses)].sort(prioritizeYggdrasil);
    const finalRenewalToken = renewalToken || generateRenewalToken(getMyUPeerId(), 3);
    const deviceId = getMyDeviceId();

    const data: any = { upeerId: getMyUPeerId(), addresses: sortedAddresses, dhtSeq, expiresAt, deviceId };
    if (deviceMeta) data.deviceMeta = deviceMeta;

    const sig = sign(Buffer.from(canonicalStringify(data))).toString('hex');

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

export function verifyLocationBlock(
    upeerId: string,
    block: { address: string; addresses?: string[]; dhtSeq: number; signature: string; expiresAt?: number; renewalToken?: RenewalToken; deviceId?: string; deviceMeta?: DeviceMetadata },
    publicKeyHex: string
): boolean {
    if (block.expiresAt === undefined) {
        warn('Rejected legacy location block (missing expiresAt)', { upeerId }, 'dht');
        return false;
    }

    if (block.expiresAt < Date.now()) {
        return false;
    }

    try {
        const inputAddresses = block.addresses || [block.address];
        const sortedAddresses = [...new Set(inputAddresses)].sort(prioritizeYggdrasil);
        sortedAddresses.forEach(addr => validateAddress(addr));

        const data: any = { upeerId, addresses: sortedAddresses, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
        if (block.deviceId) data.deviceId = block.deviceId;
        if (block.deviceMeta) data.deviceMeta = block.deviceMeta;

        let isValid = verify(
            Buffer.from(canonicalStringify(data)),
            safeBufferFromHex(block.signature, 64, 'signature'),
            safeBufferFromHex(publicKeyHex, 32, 'publicKey')
        );

        if (!isValid && !block.deviceId && !block.deviceMeta) {
            const legacyData = { upeerId, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
            isValid = verify(
                Buffer.from(canonicalStringify(legacyData)),
                safeBufferFromHex(block.signature, 64, 'signature'),
                safeBufferFromHex(publicKeyHex, 32, 'publicKey')
            );
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

export async function verifyLocationBlockWithDHT(
    upeerId: string,
    block: { address: string; addresses?: string[]; dhtSeq: number; signature: string; expiresAt?: number; renewalToken?: RenewalToken },
    publicKeyHex: string
): Promise<boolean> {
    if (block.expiresAt === undefined) return false;

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
