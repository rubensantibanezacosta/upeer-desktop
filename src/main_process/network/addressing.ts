import os from 'node:os';
import { getYggstackAddress } from '../sidecars/yggstack.js';
import type { DeviceMetadata } from './types.js';
import { isYggdrasilAddress as isYggdrasilAddressRange } from '../../utils/yggdrasilAddress.js';

export function isYggdrasilAddress(address: string): boolean {
    return isYggdrasilAddressRange(address);
}

export function validateAddress(address: string): void {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ipv4Regex.test(address) && !ipv6Regex.test(address)) {
        throw new Error(`Invalid network address format: ${address}`);
    }
    if (ipv4Regex.test(address)) {
        const octets = address.split('.').map(Number);
        if (octets.some(o => o > 255)) {
            throw new Error(`Invalid IPv4 address: octet > 255 in ${address}`);
        }
    }
}

export function prioritizeYggdrasil(a: string, b: string): number {
    const isAYgg = a.startsWith('2') || a.startsWith('3') || a.includes(':');
    const isBYgg = b.startsWith('2') || b.startsWith('3') || b.includes(':');

    if (isAYgg && !isBYgg) return -1;
    if (!isAYgg && isBYgg) return 1;
    return a.localeCompare(b);
}

export function getNetworkAddresses(): string[] {
    const addresses: string[] = [];
    const yggAddr = getYggstackAddress();
    if (yggAddr) addresses.push(yggAddr);

    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
            if (net.internal) continue;

            const family = net.family;
            const ipv6 = (family as unknown) === 'IPv6' || (family as unknown) === 6;

            if (ipv6 && isYggdrasilAddress(net.address)) {
                if (!addresses.includes(net.address)) addresses.push(net.address);
                continue;
            }

            if (!ipv6) {
                if (!/^(docker|br-|veth|lo)/.test(name)) {
                    addresses.push(net.address);
                }
            } else if (net.address.startsWith('fe80:')) {
                addresses.push(net.address);
            }
        }
    }

    return [...new Set(addresses)];
}

export function getNetworkAddress(): string | null {
    const list = getNetworkAddresses();
    return list.length > 0 ? list[0] : null;
}

export function getDeviceMetadata(): DeviceMetadata {
    return {
        clientName: 'Revelnest Desktop',
        clientVersion: '1.2.0',
        platform: os.platform(),
        deviceClass: 'desktop'
    };
}
