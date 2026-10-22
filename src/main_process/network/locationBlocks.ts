import sodium from 'sodium-native';
import { getMyUPeerId, sign, verify, getMyAlias, getMyDeviceId, getMyDhtSeq } from '../security/identity.js';
import { getDeviceIdentity, verifyDeviceCertificate, verifyDeviceLocationBlock } from '../security/deviceIdentity.js';
import { findAccountRegistry, verifyDeviceAdmission } from './accountRegistry.js';
import { warn, debug } from '../security/secure-logger.js';
import { validateAddress, prioritizeYggdrasil } from './addressing.js';
import { canonicalStringify, safeBufferFromHex } from './cryptoUtils.js';
import { findRenewalTokenInDHT, generateRenewalToken, verifyRenewalToken } from './renewalTokens.js';
import type { RenewalToken, DeviceMetadata, LocationBlock } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const LOCATION_BLOCK_TTL_MS = 30 * DAY_MS;
export const LOCATION_BLOCK_TTL_MAX = 60 * DAY_MS;
export const LOCATION_BLOCK_REFRESH_MS = 1 * DAY_MS;

type SignedLocationPayload = {
    upeerId: string;
    addresses: string[];
    dhtSeq: number;
    expiresAt: number;
    deviceId?: string;
    deviceMeta?: DeviceMetadata;
};

type VerifiableLocationBlock = Pick<LocationBlock, 'address' | 'addresses' | 'dhtSeq' | 'signature' | 'expiresAt' | 'renewalToken' | 'deviceId' | 'deviceMeta'> & {
    deviceCertificate?: unknown;
};

export function generateSignedLocationBlock(addressOrAddresses: string | string[], dhtSeq: number, ttlMs?: number, renewalToken?: RenewalToken, deviceMeta?: DeviceMetadata) {
    const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
    const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
    const expiresAt = Date.now() + cappedTtl;

    const addresses = Array.isArray(addressOrAddresses) ? addressOrAddresses : [addressOrAddresses];
    addresses.forEach(addr => validateAddress(addr));
    const finalRenewalToken = renewalToken || generateRenewalToken(getMyUPeerId(), 3);
    const device = getDeviceIdentity();
    const sortedAddresses = [...new Set(addresses)].sort(device ? undefined : prioritizeYggdrasil);

    if (device) {
        const blockSeq = Math.max(dhtSeq, getMyDhtSeq());
        const data: SignedLocationPayload = {
            upeerId: getMyUPeerId(),
            addresses: sortedAddresses,
            dhtSeq: blockSeq,
            expiresAt,
            deviceId: device.deviceId,
        };
        if (deviceMeta) data.deviceMeta = deviceMeta;
        const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
        sodium.crypto_sign_detached(signature, Buffer.from(canonicalStringify(data)), device.secretKey);
        return {
            address: sortedAddresses[0],
            addresses: sortedAddresses,
            dhtSeq: blockSeq,
            expiresAt,
            signature: signature.toString('hex'),
            renewalToken: finalRenewalToken,
            alias: getMyAlias() || undefined,
            deviceId: device.deviceId,
            deviceMeta,
            deviceCertificate: device.certificate,
        };
    }

    const deviceId = getMyDeviceId();
    const data: SignedLocationPayload = { upeerId: getMyUPeerId(), addresses: sortedAddresses, dhtSeq, expiresAt, deviceId };
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
    block: VerifiableLocationBlock,
    publicKeyHex: string
): boolean {
    if (block.expiresAt === undefined) {
        warn('Rejected legacy location block (missing expiresAt)', { upeerId }, 'dht');
        return false;
    }

    if (block.expiresAt < Date.now()) {
        return false;
    }

    if (block.deviceCertificate) {
        const valid = verifyDeviceLocationBlock(upeerId, block as unknown as Record<string, unknown>, publicKeyHex);
        if (!valid) return false;
        return !block.renewalToken || verifyRenewalToken(block.renewalToken, publicKeyHex);
    }

    try {
        const inputAddresses = block.addresses || [block.address];
        const sortedAddresses = [...new Set(inputAddresses)].sort(prioritizeYggdrasil);
        sortedAddresses.forEach(addr => validateAddress(addr));

        const data: SignedLocationPayload = { upeerId, addresses: sortedAddresses, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
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
    block: VerifiableLocationBlock,
    publicKeyHex: string
): Promise<boolean> {
    if (block.expiresAt === undefined) return false;

    if (block.deviceCertificate) {
        const certificate = verifyDeviceCertificate(block.deviceCertificate, upeerId);
        if (!certificate) return false;
        const registry = await findAccountRegistry(upeerId);
        if (!registry || !verifyDeviceAdmission(certificate, registry)) return false;
        return verifyLocationBlock(upeerId, block, publicKeyHex);
    }

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
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        debug('DHT verification error', { error: errorMsg }, 'dht');
        return false;
    }
}
