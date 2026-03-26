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

export async function publishLocationBlock(locationBlock: any): Promise<void> {
    await publishLocationBlockInternal(locationBlock, getKademliaInstance);
}

export async function performAutoRenewal(): Promise<void> {
    await performAutoRenewalInternal(getKademliaInstance);
}

export async function findNodeLocation(upeerId: string): Promise<any | null> {
    return await findNodeLocationInternal(upeerId, getKademliaInstance);
}

export async function iterativeFindNode(upeerId: string, sendMessage: (address: string, data: any) => void): Promise<string | null> {
    return await iterativeFindNodeInternal(upeerId, sendMessage, getKademliaInstance);
}

export async function performDhtMaintenance(): Promise<void> {
    await performDhtMaintenanceInternal(getKademliaInstance);
}

export function handleDhtFoundNodes(data: any, senderAddress: string): void {
    handleFoundNodesInternal(data, senderAddress, getKademliaInstance);
}

export function handleDhtFoundValue(data: any, senderAddress: string): void {
    handleFoundValueInternal(data, senderAddress);
}