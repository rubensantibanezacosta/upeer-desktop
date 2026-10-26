import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = vi.hoisted(() => ({
    contact: null as Record<string, unknown> | null,
    updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(async () => storage.contact),
}));

vi.mock('../../../src/main_process/storage/contacts/keys.js', () => ({
    updateContactDeviceCertificate: vi.fn((_upeerId: string, binding: Record<string, unknown>) => {
        storage.updates.push(binding);
    }),
}));

import { deviceBindingFromBlock, rememberContactDevice } from '../../../src/main_process/network/dht/contactDevice.js';

const DERIVED_DEVICE_ID = '06'.repeat(32);
const DEVICE_KEY = 'ab'.repeat(32);
const ACCOUNT_KEY = 'cd'.repeat(32);

function certificate(overrides: Record<string, unknown> = {}) {
    return {
        version: 1,
        accountUpeerId: 'ef'.repeat(32),
        accountPublicKey: ACCOUNT_KEY,
        deviceId: DERIVED_DEVICE_ID,
        devicePublicKey: DEVICE_KEY,
        issuedAt: 1_000,
        expiresAt: 2_000_000,
        epoch: 1,
        signature: 'aa'.repeat(64),
        ...overrides,
    };
}

describe('deviceBindingFromBlock', () => {
    it('extrae el vínculo del certificado del bloque', () => {
        const binding = deviceBindingFromBlock({ deviceId: DERIVED_DEVICE_ID, deviceCertificate: certificate() });
        expect(binding?.deviceId).toBe(DERIVED_DEVICE_ID);
        expect(binding?.devicePublicKey).toBe(DEVICE_KEY);
        expect(binding?.issuedAt).toBe(1_000);
        expect(JSON.parse(binding?.deviceCertificate ?? '{}').devicePublicKey).toBe(DEVICE_KEY);
    });

    it('rechaza un bloque cuyo deviceId no coincide con el certificado', () => {
        expect(deviceBindingFromBlock({ deviceId: '99'.repeat(32), deviceCertificate: certificate() })).toBeNull();
    });

    it('rechaza un bloque sin certificado', () => {
        expect(deviceBindingFromBlock({ deviceId: DERIVED_DEVICE_ID })).toBeNull();
    });

    it('rechaza un certificado con forma inválida', () => {
        expect(deviceBindingFromBlock({ deviceCertificate: { version: 2 } })).toBeNull();
    });
});

describe('rememberContactDevice', () => {
    beforeEach(() => {
        storage.contact = { upeerId: 'peer-1', deviceId: null, devicePublicKey: null, deviceCertificate: null };
        storage.updates = [];
    });

    it('persiste el vínculo cuando el contacto no tiene dispositivo', async () => {
        await expect(rememberContactDevice('peer-1', { deviceCertificate: certificate() })).resolves.toBe(true);
        expect(storage.updates).toHaveLength(1);
        expect(storage.updates[0].devicePublicKey).toBe(DEVICE_KEY);
    });

    it('no reescribe si el dispositivo ya está vinculado', async () => {
        storage.contact = { ...storage.contact, deviceCertificate: JSON.stringify(certificate()) };
        await expect(rememberContactDevice('peer-1', { deviceCertificate: certificate() })).resolves.toBe(false);
        expect(storage.updates).toHaveLength(0);
    });

    it('no reemplaza un certificado más nuevo por uno más antiguo', async () => {
        storage.contact = {
            ...storage.contact,
            deviceCertificate: JSON.stringify(certificate({ devicePublicKey: 'ee'.repeat(32), issuedAt: 5_000 })),
        };
        await expect(rememberContactDevice('peer-1', { deviceCertificate: certificate() })).resolves.toBe(false);
        expect(storage.updates).toHaveLength(0);
    });

    it('reemplaza el certificado cuando el nuevo es más reciente', async () => {
        storage.contact = {
            ...storage.contact,
            deviceCertificate: JSON.stringify(certificate({ devicePublicKey: 'ee'.repeat(32), issuedAt: 500 })),
        };
        await expect(rememberContactDevice('peer-1', { deviceCertificate: certificate() })).resolves.toBe(true);
        expect(storage.updates).toHaveLength(1);
    });

    it('no hace nada si el contacto no existe', async () => {
        storage.contact = null;
        await expect(rememberContactDevice('peer-1', { deviceCertificate: certificate() })).resolves.toBe(false);
        expect(storage.updates).toHaveLength(0);
    });
});
