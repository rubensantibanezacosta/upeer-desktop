import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sodium from 'sodium-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');
import { getUPeerIdFromPublicKey } from '../../../src/main_process/security/identityCrypto.js';
import { identityState } from '../../../src/main_process/security/identityState.js';
import { resetIdentityForEmptyDevice } from '../../../src/main_process/security/identityLifecycleInternal.js';
import {
    getDeviceIdentity,
    resetDeviceIdentityCache,
} from '../../../src/main_process/security/deviceIdentity.js';
import {
    clearAccountRegistryStateCache,
    loadAccountRegistryState,
} from '../../../src/main_process/security/accountRegistryState.js';
import {
    getMyAccountRegistry,
    verifyAccountRegistry,
    verifyDeviceAdmission,
} from '../../../src/main_process/network/accountRegistry.js';
import { revokeMyAccountDevice } from '../../../src/main_process/network/accountRegistryRevocation.js';

const otherDeviceId = 'ab'.repeat(32);
let tempDir = '';
let now = 0;

function configureIdentity(): void {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-registry-revocation-'));
    resetIdentityForEmptyDevice(tempDir);
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    identityState.publicKey = publicKey;
    identityState.secretKey = secretKey;
    identityState.upeerId = getUPeerIdFromPublicKey(publicKey);
    identityState.isLocked = false;
    resetDeviceIdentityCache();
    clearAccountRegistryStateCache();
    now = Date.now();
}

describe('account registry device revocation', () => {
    beforeEach(configureIdentity);

    afterEach(() => {
        resetDeviceIdentityCache();
        clearAccountRegistryStateCache();
        resetIdentityForEmptyDevice('');
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('revokes a device with a higher epoch and a verifiable registry', () => {
        const local = getDeviceIdentity(now);
        const initial = getMyAccountRegistry(now);
        if (!local || !initial) throw new Error('device identity was not available');

        const updated = revokeMyAccountDevice(otherDeviceId, 'lost device', now);

        expect(updated.epoch).toBe(initial.epoch + 1);
        expect(updated.revoked).toEqual([{
            deviceId: otherDeviceId,
            revokedAt: now,
            reason: 'lost device',
        }]);
        expect(verifyAccountRegistry(updated, identityState.upeerId, now)).not.toBeNull();
        expect(verifyDeviceAdmission(local.certificate, updated, now)).toBe(true);
    });

    it('persists revocations across a restart and does not advance the epoch twice', () => {
        revokeMyAccountDevice(otherDeviceId, 'lost device', now);
        const persisted = getMyAccountRegistry(now);
        if (!persisted) throw new Error('account registry was not available');

        resetDeviceIdentityCache();
        clearAccountRegistryStateCache();
        const restored = getMyAccountRegistry(now + 1_000);
        expect(restored?.epoch).toBe(persisted.epoch);
        expect(restored?.revoked).toEqual(persisted.revoked);
        expect(verifyAccountRegistry(restored, identityState.upeerId, now + 1_000)).not.toBeNull();

        const repeated = revokeMyAccountDevice(otherDeviceId, 'lost device', now + 2_000);
        expect(repeated.epoch).toBe(persisted.epoch);
        expect(repeated.revoked).toHaveLength(1);
        expect(loadAccountRegistryState(now + 2_000)?.revoked).toHaveLength(1);
    });

    it('fails closed when the persisted revocation state is corrupt', () => {
        if (!getDeviceIdentity(now)) throw new Error('device identity was not available');
        fs.writeFileSync(path.join(tempDir, 'account-registry.enc'), Buffer.from('corrupt'));
        clearAccountRegistryStateCache();

        expect(getMyAccountRegistry(now)).toBeNull();
        expect(() => revokeMyAccountDevice(otherDeviceId, 'lost', now)).toThrow(/registry is not available/);
    });

    it('rejects revoking the local device and malformed revocations', () => {
        const local = getDeviceIdentity(now);
        if (!local) throw new Error('device identity was not available');

        expect(() => revokeMyAccountDevice(local.deviceId, 'self', now)).toThrow(/local device/);
        expect(() => revokeMyAccountDevice('not-a-device', 'lost', now)).toThrow(/deviceId/);
        expect(() => revokeMyAccountDevice(otherDeviceId, '   ', now)).toThrow(/reason/);
        expect(getMyAccountRegistry(now)?.revoked).toEqual([]);
    });
});
