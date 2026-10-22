import { warn } from '../../security/secure-logger.js';

type SelfDeviceKademlia = {
    findClosestContacts(targetId: string, count: number): Array<{ upeerId: string; address: string }>;
};

export async function getSelfDeviceAddresses(
    myId: string,
    kademlia: SelfDeviceKademlia | null,
): Promise<string[]> {
    if (!kademlia || typeof kademlia.findClosestContacts !== 'function') return [];
    try {
        const { getYggstackAddress } = await import('../../sidecars/yggstack.js');
        const myYggAddress = getYggstackAddress();
        const addresses = new Map<string, string>();
        for (const node of kademlia.findClosestContacts(myId, 20)) {
            if (node.upeerId !== myId || typeof node.address !== 'string') continue;
            const address = node.address.trim();
            if (!address || address === myYggAddress) continue;
            const key = address.toLowerCase();
            if (!addresses.has(key)) addresses.set(key, address);
        }
        return Array.from(addresses.values());
    } catch (err) {
        warn('Failed to discover own vault devices', err, 'vault');
        return [];
    }
}
