import {
    isValidHexId,
    validateHexKey40Or64,
    validateJsonSerializableValue,
    validateLocationBlock,
    type ValidationResult,
} from './validationShared.js';
import type {
    DhtFindNode,
    DhtFindValue,
    DhtFoundValue,
    DhtStore,
    DhtStoreAck,
    LocationBlock,
} from '../network/types.js';

type DhtQueryPayload = {
    targetId?: unknown;
};

type DhtResponsePayload = {
    targetId?: unknown;
    locationBlock?: LocationBlock;
    neighbors?: unknown;
};

type DhtUpdatePayload = {
    locationBlock?: LocationBlock;
};

type DhtExchangePeer = {
    upeerId?: unknown;
    publicKey?: unknown;
    locationBlock?: unknown;
};

type DhtExchangePayload = {
    peers?: DhtExchangePeer[];
};

type DhtFoundNodesPayload = {
    nodes?: unknown;
};

type DhtFoundValuePayload = Partial<DhtFoundValue> & {
    key?: unknown;
    value?: unknown;
    nodes?: unknown;
};

type DhtPingPongPayload = {
    nodeId?: unknown;
};

type SyncPulsePayload = {
    action?: unknown;
    deviceId?: unknown;
    messageId?: unknown;
    newContent?: unknown;
};

function validateDhtNodeId(value: unknown, fieldName: string): ValidationResult {
    if (value !== undefined && (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value) || value.length > 128)) {
        return { valid: false, error: `Invalid ${fieldName}` };
    }
    return { valid: true };
}

export function validateDhtQuery(data: DhtQueryPayload): ValidationResult {
    if (!isValidHexId(data.targetId)) {
        return { valid: false, error: 'Invalid targetId' };
    }
    return { valid: true };
}

export function validateDhtResponse(data: DhtResponsePayload): ValidationResult {
    if (!isValidHexId(data.targetId)) {
        return { valid: false, error: 'Invalid targetId' };
    }
    if (data.locationBlock) {
        const locationBlock = validateLocationBlock(data.locationBlock, false);
        if (!locationBlock.valid) return locationBlock;
    }
    if (data.neighbors && !Array.isArray(data.neighbors)) {
        return { valid: false, error: 'Invalid neighbors array' };
    }
    return { valid: true };
}

export function validateDhtUpdate(data: DhtUpdatePayload): ValidationResult {
    return validateLocationBlock(data.locationBlock);
}

export function validateDhtExchange(data: DhtExchangePayload): ValidationResult {
    if (!Array.isArray(data.peers)) {
        return { valid: false, error: 'Invalid peers array' };
    }
    if (data.peers.length > 50) {
        return { valid: false, error: 'Too many peers' };
    }

    for (const peer of data.peers) {
        if (!isValidHexId(peer.upeerId)) {
            return { valid: false, error: 'Invalid peer upeerId' };
        }
        if (!peer.publicKey || typeof peer.publicKey !== 'string' || peer.publicKey.length !== 64) {
            return { valid: false, error: 'Invalid peer publicKey' };
        }
        if (peer.locationBlock && typeof peer.locationBlock === 'object') {
            const locationBlock = validateLocationBlock(peer.locationBlock, false);
            if (!locationBlock.valid) {
                if (locationBlock.error === 'Invalid locationBlock.address') {
                    return { valid: false, error: 'Invalid peer locationBlock.address' };
                }
                if (locationBlock.error === 'Invalid locationBlock.dhtSeq') {
                    return { valid: false, error: 'Invalid peer locationBlock.dhtSeq' };
                }
                if (locationBlock.error === 'Invalid locationBlock.signature') {
                    return { valid: false, error: 'Invalid peer locationBlock.signature' };
                }
                return locationBlock;
            }
        }
    }

    return { valid: true };
}

export function validateDhtFindNode(data: Partial<DhtFindNode>): ValidationResult {
    if (!data.targetId || typeof data.targetId !== 'string' || !/^[0-9a-f]+$/i.test(data.targetId) || data.targetId.length > 128) {
        return { valid: false, error: 'Invalid targetId' };
    }
    return { valid: true };
}

export function validateDhtFindValue(data: Partial<DhtFindValue>): ValidationResult {
    if (!validateHexKey40Or64(data.key)) {
        return { valid: false, error: 'Invalid key (expected 40 or 64 hex chars)' };
    }
    return { valid: true };
}

export function validateDhtStore(data: Partial<DhtStore> & { ttl?: unknown }): ValidationResult {
    if (!validateHexKey40Or64(data.key)) {
        return { valid: false, error: 'Invalid key (expected 40 or 64 hex chars)' };
    }
    const value = validateJsonSerializableValue(data.value, 10_000);
    if (!value.valid) return value;
    if (data.ttl !== undefined && (typeof data.ttl !== 'number' || data.ttl < 0 || data.ttl > 2592000)) {
        return { valid: false, error: 'Invalid TTL' };
    }
    return { valid: true };
}

export function validateDhtStoreAck(data: Partial<DhtStoreAck>): ValidationResult {
    if (!validateHexKey40Or64(data.key)) {
        return { valid: false, error: 'Invalid key (expected 40 or 64 hex chars)' };
    }
    return { valid: true };
}

export function validateDhtFoundNodes(data: DhtFoundNodesPayload): ValidationResult {
    if (!Array.isArray(data.nodes)) {
        return { valid: false, error: 'Missing or invalid nodes array' };
    }
    if (data.nodes.length > 20) {
        return { valid: false, error: 'Too many nodes (max 20)' };
    }
    for (const node of data.nodes) {
        if (typeof node !== 'object' || node === null) {
            return { valid: false, error: 'Invalid node entry' };
        }
        if (typeof node.upeerId !== 'string' || !/^[0-9a-f]+$/i.test(node.upeerId) || node.upeerId.length > 128) {
            return { valid: false, error: 'Invalid node.upeerId' };
        }
        if (typeof node.address !== 'string' || node.address.length > 100) {
            return { valid: false, error: 'Invalid node.address' };
        }
    }
    return { valid: true };
}

export function validateDhtFoundValue(data: DhtFoundValuePayload): ValidationResult {
    if (data.key !== undefined && !validateHexKey40Or64(data.key)) {
        return { valid: false, error: 'Invalid key' };
    }
    if (data.value === undefined && data.nodes === undefined) {
        return { valid: false, error: 'Missing value or nodes' };
    }
    if (data.value !== undefined) {
        const value = validateJsonSerializableValue(data.value, 10_000);
        if (!value.valid) return value;
    }
    return { valid: true };
}

export function validateDhtPing(data: DhtPingPongPayload): ValidationResult {
    return validateDhtNodeId(data.nodeId, 'nodeId');
}

export function validateDhtPong(data: DhtPingPongPayload): ValidationResult {
    return validateDhtNodeId(data.nodeId, 'nodeId');
}

export function validateSyncPulse(data: SyncPulsePayload): ValidationResult {
    if (!data.action || typeof data.action !== 'string' || data.action.length > 50) {
        return { valid: false, error: 'Invalid action' };
    }
    if (data.deviceId !== undefined && (typeof data.deviceId !== 'string' || data.deviceId.length > 128)) {
        return { valid: false, error: 'Invalid deviceId' };
    }
    if (data.messageId !== undefined && typeof data.messageId !== 'string') {
        return { valid: false, error: 'Invalid messageId' };
    }
    if (data.newContent !== undefined && (typeof data.newContent !== 'string' || data.newContent.length > 50_000)) {
        return { valid: false, error: 'newContent too large' };
    }
    return { valid: true };
}
