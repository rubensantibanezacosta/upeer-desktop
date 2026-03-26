import crypto from 'node:crypto';
import { sign, verify } from '../security/identity.js';
import { getKademliaInstance } from './dht/shared.js';
import { network, warn, error } from '../security/secure-logger.js';
import { canonicalStringify, safeBufferFromHex } from './cryptoUtils.js';
import type { RenewalToken } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RENEWAL_TOKEN_ALLOWED_UNTIL_MS = 60 * DAY_MS;
export const AUTO_RENEW_THRESHOLD_MS = 3 * DAY_MS;

export function generateRenewalToken(targetId: string, maxRenewals = 3): RenewalToken {
    const allowedUntil = Date.now() + RENEWAL_TOKEN_ALLOWED_UNTIL_MS;
    const signedData = { targetId, allowedUntil, maxRenewals };
    const signature = sign(Buffer.from(canonicalStringify(signedData))).toString('hex');
    return { targetId, allowedUntil, maxRenewals, renewalsUsed: 0, signature };
}

export function verifyRenewalToken(token: RenewalToken, publicKeyHex: string): boolean {
    if (token.allowedUntil < Date.now()) return false;
    if (token.renewalsUsed >= token.maxRenewals) return false;
    const { signature, renewalsUsed: _renewalsUsed, ...signedData } = token;
    try {
        return verify(
            Buffer.from(canonicalStringify(signedData)),
            safeBufferFromHex(signature, 64, 'renewalSignature'),
            safeBufferFromHex(publicKeyHex, 32, 'publicKey')
        );
    } catch {
        return false;
    }
}

export function canRenewLocationBlock(block: { expiresAt?: number; renewalToken?: RenewalToken }, publicKeyHex: string): boolean {
    if (!block.renewalToken) return false;
    const now = Date.now();
    const expiresAt = block.expiresAt || now;
    const timeUntilExpiry = expiresAt - now;
    if (timeUntilExpiry > AUTO_RENEW_THRESHOLD_MS && timeUntilExpiry > 0) {
        return false;
    }
    return verifyRenewalToken(block.renewalToken, publicKeyHex);
}

export function renewLocationBlock(block: { address: string; dhtSeq: number; signature: string; expiresAt?: number; renewalToken?: RenewalToken }, publicKeyHex: string): { address: string; dhtSeq: number; expiresAt: number; signature: string; renewalToken?: RenewalToken } | null {
    if (!canRenewLocationBlock(block, publicKeyHex) || !block.renewalToken) {
        return null;
    }

    const renewedToken = {
        ...block.renewalToken,
        renewalsUsed: (block.renewalToken.renewalsUsed || 0) + 1
    };

    return {
        address: block.address,
        dhtSeq: block.dhtSeq,
        expiresAt: block.expiresAt ?? 0,
        signature: block.signature,
        renewalToken: renewedToken
    };
}

export function createRenewalTokenKey(targetId: string, signaturePrefix?: string): Buffer {
    const hash = crypto.createHash('sha256');
    const sigPart = signaturePrefix ? signaturePrefix.substring(0, 16) : '';
    hash.update(`renewal:${targetId}:${sigPart}`);
    return hash.digest();
}

export async function storeRenewalTokenInDHT(token: RenewalToken): Promise<boolean> {
    const kademlia = getKademliaInstance();
    if (!kademlia) {
        warn('Kademlia DHT not available for storing renewal token', {}, 'dht-renewal');
        return false;
    }

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

export async function findRenewalTokenInDHT(targetId: string, tokenSignature?: string): Promise<RenewalToken | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) {
        warn('Kademlia DHT not available for finding renewal token', {}, 'dht-renewal');
        return null;
    }

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

export async function canRenewLocationBlockWithDHT(
    block: { expiresAt?: number; renewalToken?: RenewalToken },
    publicKeyHex: string,
    targetId: string
): Promise<boolean> {
    if (block.renewalToken) {
        return verifyRenewalToken(block.renewalToken, publicKeyHex);
    }

    const token = await findRenewalTokenInDHT(targetId);
    if (!token) return false;
    return verifyRenewalToken(token, publicKeyHex);
}

export async function renewLocationBlockWithDHT(
    block: { address: string; addresses?: string[]; dhtSeq: number; signature: string; expiresAt?: number; renewalToken?: RenewalToken },
    publicKeyHex: string,
    targetId: string
): Promise<{ address: string; addresses?: string[]; dhtSeq: number; expiresAt: number; signature: string; renewalToken?: RenewalToken } | null> {
    if (block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex)) {
        return renewLocationBlock(block, publicKeyHex);
    }

    const token = await findRenewalTokenInDHT(targetId);
    if (!token) return null;
    if (!verifyRenewalToken(token, publicKeyHex)) return null;

    const renewedToken = {
        ...token,
        renewalsUsed: (token.renewalsUsed || 0) + 1
    };

    return {
        address: block.address,
        addresses: block.addresses,
        dhtSeq: block.dhtSeq,
        expiresAt: block.expiresAt ?? 0,
        signature: block.signature,
        renewalToken: renewedToken
    };
}
