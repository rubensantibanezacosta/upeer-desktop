import { setKademliaInstance, getKademliaInstance } from './shared.js';
export { setKademliaInstance, getKademliaInstance };
export { pendingQueries, cleanupPendingQueries } from './pendingQueries.js';
export { handleDhtPacket } from './packetRouter.js';
import {
    publishLocationBlock as publishLocationBlockInternal,
    performAutoRenewal as performAutoRenewalInternal,
    findNodeLocation as findNodeLocationInternal,
    iterativeFindNode as iterativeFindNodeInternal,
    performDhtMaintenance as performDhtMaintenanceInternal,
} from './kademliaOps.js';

import { handleDhtFoundNodes as handleFoundNodesInternal, handleDhtFoundValue as handleFoundValueInternal } from './pendingQueries.js';
import type { DhtFoundNodes, DhtFoundValue, LocationBlock } from '../types.js';

type DhtFindNodePacket = {
    type: 'DHT_FIND_NODE';
    targetId: string;
    queryId: string;
};

export async function publishLocationBlock(locationBlock: LocationBlock): Promise<void> {
    await publishLocationBlockInternal(locationBlock, () => getKademliaInstance() as unknown as Parameters<typeof publishLocationBlockInternal>[1] extends () => infer R ? R : never);
}

export async function performAutoRenewal(): Promise<void> {
    await performAutoRenewalInternal(() => getKademliaInstance() as unknown as Parameters<typeof performAutoRenewalInternal>[0] extends () => infer R ? R : never);
}

export async function findNodeLocation(upeerId: string): Promise<LocationBlock | null> {
    return await findNodeLocationInternal(upeerId, () => getKademliaInstance() as unknown as Parameters<typeof findNodeLocationInternal>[1] extends () => infer R ? R : never);
}

export async function iterativeFindNode(upeerId: string, sendMessage: (address: string, data: DhtFindNodePacket) => void): Promise<string | null> {
    return await iterativeFindNodeInternal(upeerId, sendMessage, () => getKademliaInstance() as unknown as Parameters<typeof iterativeFindNodeInternal>[2] extends () => infer R ? R : never);
}

export async function performDhtMaintenance(): Promise<void> {
    await performDhtMaintenanceInternal(() => getKademliaInstance() as unknown as Parameters<typeof performDhtMaintenanceInternal>[0] extends () => infer R ? R : never);
}

export function handleDhtFoundNodes(data: DhtFoundNodes & { queryId?: string }, senderAddress: string): void {
    handleFoundNodesInternal(data, senderAddress, getKademliaInstance);
}

export function handleDhtFoundValue(data: DhtFoundValue & { queryId?: string }, senderAddress: string): void {
    handleFoundValueInternal(data, senderAddress);
}