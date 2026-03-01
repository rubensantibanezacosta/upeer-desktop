import os from 'node:os';
import { getMyRevelNestId, sign, verify } from '../security/identity.js';

/**
 * Ensures JSON keys are always in the same order for consistent signatures.
 */
export function canonicalStringify(obj: any): string {
    const allKeys = Object.keys(obj).sort();
    return JSON.stringify(obj, allKeys);
}

export function generateSignedLocationBlock(address: string, dhtSeq: number) {
    const data = { revelnestId: getMyRevelNestId(), address, dhtSeq };
    const sig = sign(Buffer.from(canonicalStringify(data))).toString('hex');
    return { address, dhtSeq, signature: sig };
}

export function verifyLocationBlock(revelnestId: string, block: { address: string, dhtSeq: number, signature: string }, publicKeyHex: string): boolean {
    const data = { revelnestId, address: block.address, dhtSeq: block.dhtSeq };
    return verify(
        Buffer.from(canonicalStringify(data)),
        Buffer.from(block.signature, 'hex'),
        Buffer.from(publicKeyHex, 'hex')
    );
}

export function getNetworkAddress() {
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
