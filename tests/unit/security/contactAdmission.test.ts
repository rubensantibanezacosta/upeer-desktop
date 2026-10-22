import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');
import {
    ContactAdmissionError,
    requireContactAdmission,
    resetContactAdmissionCache,
} from '../../../src/main_process/network/contactAdmission.js';
import { verifyAccountRegistry } from '../../../src/main_process/network/accountRegistry.js';
import type { LocationBlock } from '../../../src/main_process/network/types.js';

type AccountVector = {
    now: number;
    accountPublicKey: string;
    accountUpeerId: string;
    registry: Record<string, unknown>;
    locationBlock: Record<string, unknown>;
};

const vector = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/dht-account-go.json'), 'utf8'),
) as AccountVector;
const now = vector.now;
const account = vector.accountUpeerId;
const publicKey = vector.accountPublicKey;
const registry = verifyAccountRegistry(vector.registry, account, now);
const location = vector.locationBlock as unknown as LocationBlock;

if (!registry) throw new Error('Go account registry was rejected');

describe('contact admission before encryption', () => {
    beforeEach(() => {
        resetContactAdmissionCache();
        vi.clearAllMocks();
    });

    it('admite el dispositivo del vector Go y cachea la decisión', async () => {
        let registryCalls = 0;
        let locationCalls = 0;
        const verifyLocation = vi.fn(async () => true);

        const options = {
            now,
            findRegistry: async () => {
                registryCalls += 1;
                return registry;
            },
            findLocation: async () => {
                locationCalls += 1;
                return location;
            },
            verifyLocation,
            warn: vi.fn(),
            debug: vi.fn(),
        };

        await expect(requireContactAdmission(account, publicKey, options)).resolves.toBeUndefined();
        await expect(requireContactAdmission(account, publicKey, options)).resolves.toBeUndefined();

        expect(registryCalls).toBe(2);
        expect(locationCalls).toBe(1);
        expect(verifyLocation).toHaveBeenCalledWith(account, location, publicKey);
    });

    it('revalida la ubicación cuando cambia el epoch del registro', async () => {
        let epoch = registry.epoch;
        let locationCalls = 0;
        const options = {
            now,
            findRegistry: async () => ({ ...registry, epoch }),
            findLocation: async () => {
                locationCalls += 1;
                return location;
            },
            verifyLocation: async () => true,
            warn: vi.fn(),
            debug: vi.fn(),
        };

        await requireContactAdmission(account, publicKey, options);
        epoch += 1;
        await requireContactAdmission(account, publicKey, options);

        expect(locationCalls).toBe(2);
    });

    it('permite con auditoría un contacto sin registro y no repite el aviso dentro del TTL', async () => {
        let registryCalls = 0;
        const warn = vi.fn();
        const options = {
            now,
            findRegistry: async () => {
                registryCalls += 1;
                return null;
            },
            warn,
            debug: vi.fn(),
        };

        await expect(requireContactAdmission(account, publicKey, options)).resolves.toBeUndefined();
        await expect(requireContactAdmission(account, publicKey, options)).resolves.toBeUndefined();

        expect(registryCalls).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('account registry is unavailable'),
            { account, epoch: -1 },
            'security',
        );
    });

    it('rechaza un contacto sin registro cuando la política es fail-closed', async () => {
        await expect(requireContactAdmission(account, publicKey, {
            now,
            policy: 'reject',
            findRegistry: async () => null,
            warn: vi.fn(),
            debug: vi.fn(),
        })).rejects.toBeInstanceOf(ContactAdmissionError);
    });

    it('rechaza un registro expirado antes de buscar la ubicación', async () => {
        const findLocation = vi.fn(async () => location);

        await expect(requireContactAdmission(account, publicKey, {
            now,
            findRegistry: async () => ({ ...registry, expiresAt: now }),
            findLocation,
            warn: vi.fn(),
            debug: vi.fn(),
        })).rejects.toThrow('account registry is expired');
        expect(findLocation).not.toHaveBeenCalled();
    });

    it('permite con auditoría un bloque legacy sin certificado y lo rechaza con fail-closed', async () => {
        const legacy = { ...location, deviceCertificate: undefined } as LocationBlock;
        const warn = vi.fn();
        const base = {
            now,
            findRegistry: async () => registry,
            findLocation: async () => legacy,
            warn,
            debug: vi.fn(),
        };

        await expect(requireContactAdmission(account, publicKey, base)).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('no device certificate'),
            { account, epoch: registry.epoch },
            'security',
        );

        resetContactAdmissionCache();
        await expect(requireContactAdmission(account, publicKey, {
            ...base,
            policy: 'reject',
        })).rejects.toBeInstanceOf(ContactAdmissionError);
    });

    it('rechaza un certificado no admitido o una ubicación inválida', async () => {
        const base = {
            now,
            findRegistry: async () => registry,
            findLocation: async () => location,
            warn: vi.fn(),
            debug: vi.fn(),
        };

        await expect(requireContactAdmission(account, publicKey, {
            ...base,
            verifyAdmission: () => false,
        })).rejects.toThrow('contact device is not admitted');

        resetContactAdmissionCache();
        await expect(requireContactAdmission(account, publicKey, {
            ...base,
            verifyLocation: async () => false,
        })).rejects.toThrow('contact location is invalid');
    });

    it('omite identificadores que no son cuentas uPeer', async () => {
        let registryCalls = 0;

        await expect(requireContactAdmission('peer-1', publicKey, {
            now,
            findRegistry: async () => {
                registryCalls += 1;
                return null;
            },
            debug: vi.fn(),
        })).resolves.toBeUndefined();

        expect(registryCalls).toBe(0);
    });
});

