import { getDeviceIdentity } from '../security/deviceIdentity.js';
import {
    appendAccountRegistryRevocation,
    loadAccountRegistryStateResult,
    normalizeRevocation,
    saveAccountRegistryState,
} from '../security/accountRegistryState.js';
import { getMyAccountRegistry, type AccountRegistry } from './accountRegistry.js';

export function revokeMyAccountDevice(
    deviceId: string,
    reason: string,
    now = Date.now(),
): AccountRegistry {
    const identity = getDeviceIdentity(now);
    if (!identity) throw new Error('device identity is not available');
    const revocation = normalizeRevocation(deviceId, reason, now);
    if (revocation.deviceId === identity.deviceId) throw new Error('the local device cannot revoke itself');
    const current = getMyAccountRegistry(now);
    if (!current) throw new Error('account registry is not available');
    if (current.revoked.some(item => item.deviceId === revocation.deviceId)) return current;
    const persisted = loadAccountRegistryStateResult(now);
    if (persisted.status === 'invalid') throw new Error('account revocation state is invalid');
    const state = appendAccountRegistryRevocation(
        persisted.status === 'ready' ? persisted.state : null,
        current.accountUpeerId,
        Math.max(current.epoch, identity.certificate.epoch),
        Math.max(now, identity.certificate.issuedAt),
        revocation,
    );
    if (!saveAccountRegistryState(state, now)) throw new Error('account revocation state could not be persisted');
    const updated = getMyAccountRegistry(now);
    if (!updated || updated.epoch <= current.epoch) throw new Error('account registry epoch did not advance');
    return updated;
}
