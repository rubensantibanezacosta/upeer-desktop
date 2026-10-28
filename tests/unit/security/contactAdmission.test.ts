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

    it('rechaza un contacto sin registro y sin decisión previa', async () => {
        await expect(requireContactAdmission(account, publicKey, {
            now,
            findRegistry: async () => null,
            warn: vi.fn(),
            debug: vi.fn(),
        })).rejects.toThrow('account registry is unavailable');
    });

    it('reutiliza la decisión previa durante la ventana de gracia y la rechaza al expirar', async () => {
        const warn = vi.fn();
        const admitted = {
            now,
            findRegistry: async () => registry,
            findLocation: async () => location,
            verifyLocation: async () => true,
            warn,
            debug: vi.fn(),
        };

        await requireContactAdmission(account, publicKey, admitted);
        const unavailable = { ...admitted, findRegistry: async () => null };
        await expect(requireContactAdmission(account, publicKey, unavailable)).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('decisión previa'),
            expect.objectContaining({ account }),
            'security',
        );

        resetContactAdmissionCache();
        await requireContactAdmission(account, publicKey, admitted);
        await expect(requireContactAdmission(account, publicKey, {
            ...unavailable,
            now: now + 16 * 60 * 1000,
        })).rejects.toThrow('account registry is unavailable');
    });

    it('no reutiliza la decisión previa si el dispositivo anunciado cambia', async () => {
        const admitted = {
            now,
            findRegistry: async () => registry,
            findLocation: async () => location,
            verifyLocation: async () => true,
            warn: vi.fn(),
            debug: vi.fn(),
        };
        const certificate = location.deviceCertificate as Record<string, unknown>;

        await requireContactAdmission(account, publicKey, {
            ...admitted,
            expectedDevice: {
                deviceId: String(certificate.deviceId),
                devicePublicKey: String(certificate.devicePublicKey),
            },
        });

        await expect(requireContactAdmission(account, publicKey, {
            ...admitted,
            findRegistry: async () => null,
            expectedDevice: { deviceId: 'ab'.repeat(32) },
        })).rejects.toThrow('account registry is unavailable');
    });

    it('admite con auditoría un contacto sin registro cuando la política lo permite', async () => {
        let registryCalls = 0;
        const warn = vi.fn();
        const options = {
            now,
            policy: 'allow-with-audit' as const,
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

    it('rechaza un bloque legacy sin certificado y conserva la vía permisiva explícita', async () => {
        const legacy = { ...location, deviceCertificate: undefined } as LocationBlock;
        const warn = vi.fn();
        const base = {
            now,
            findRegistry: async () => registry,
            findLocation: async () => legacy,
            warn,
            debug: vi.fn(),
        };

        await expect(requireContactAdmission(account, publicKey, base))
            .rejects.toThrow('contact location has no device certificate');

        resetContactAdmissionCache();
        await expect(requireContactAdmission(account, publicKey, {
            ...base,
            policy: 'allow-with-audit',
        })).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('no device certificate'),
            { account, epoch: registry.epoch },
            'security',
        );
    });

    it('rechaza un contacto sin bloque de ubicación', async () => {
        await expect(requireContactAdmission(account, publicKey, {
            now,
            findRegistry: async () => registry,
            findLocation: async () => null,
            warn: vi.fn(),
            debug: vi.fn(),
        })).rejects.toThrow('contact has no verified location');
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

    it('rechaza un dispositivo que no coincide con el anunciado para mensajería', async () => {
        const certificate = location.deviceCertificate as Record<string, unknown>;
        const options = {
            now,
            findRegistry: async () => registry,
            findLocation: async () => location,
            verifyLocation: async () => true,
            warn: vi.fn(),
            debug: vi.fn(),
        };

        await expect(requireContactAdmission(account, publicKey, {
            ...options,
            expectedDevice: {
                deviceId: String(certificate.deviceId),
                devicePublicKey: String(certificate.devicePublicKey),
            },
        })).resolves.toBeUndefined();

        resetContactAdmissionCache();
        await expect(requireContactAdmission(account, publicKey, {
            ...options,
            expectedDevice: { deviceId: 'aa'.repeat(32) },
        })).rejects.toThrow('contact device does not match the advertised messaging device');

        resetContactAdmissionCache();
        await expect(requireContactAdmission(account, publicKey, {
            ...options,
            expectedDevice: { devicePublicKey: 'bb'.repeat(32) },
        })).rejects.toThrow('contact device key does not match the advertised messaging key');
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

