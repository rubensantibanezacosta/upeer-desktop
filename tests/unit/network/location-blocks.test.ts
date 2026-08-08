import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    getMyDeviceId: vi.fn(() => 'device-1'),
    getMyAlias: vi.fn(() => 'Alice'),
    sign: vi.fn(() => Buffer.from('ab', 'hex') as unknown as Buffer),
    verify: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../../src/main_process/network/renewalTokens.js', () => ({
    generateRenewalToken: vi.fn(() => ({
        targetId: 'self-id',
        allowedUntil: Date.now() + 1000000,
        maxRenewals: 3,
        renewalsUsed: 0,
        signature: 'a'.repeat(128),
    })),
    findRenewalTokenInDHT: vi.fn(),
    verifyRenewalToken: vi.fn(() => true),
}));

type LocationBlock = {
    address: string;
    addresses?: string[];
    dhtSeq: number;
    signature: string;
    expiresAt?: number;
    renewalToken?: unknown;
    deviceId?: string;
    deviceMeta?: unknown;
};

describe('locationBlocks', () => {
    let mod: typeof import('../../../src/main_process/network/locationBlocks.js');
    let renewal: typeof import('../../../src/main_process/network/renewalTokens.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        mod = await import('../../../src/main_process/network/locationBlocks.js');
        renewal = await import('../../../src/main_process/network/renewalTokens.js');
    });

    describe('generateSignedLocationBlock', () => {
        it('genera un bloque firmado con TTL por defecto', () => {
            const block = mod.generateSignedLocationBlock('200::1', 5);
            expect(block.address).toBe('200::1');
            expect(block.addresses).toEqual(['200::1']);
            expect(block.dhtSeq).toBe(5);
            expect(block.deviceId).toBe('device-1');
            expect(block.expiresAt).toBeGreaterThan(Date.now());
            expect(block.signature).toBeDefined();
            expect(renewal.generateRenewalToken).toHaveBeenCalled();
        });

        it('acepta un array de direcciones, deduplica y ordena', () => {
            const block = mod.generateSignedLocationBlock(['200::2', '200::1', '200::2'], 1);
            expect(block.addresses).toEqual(['200::1', '200::2']);
        });

        it('respeta un renewalToken proporcionado y el TTL proporcionado', () => {
            const provided = {
                targetId: 'self-id',
                allowedUntil: Date.now() + 1,
                maxRenewals: 3,
                renewalsUsed: 0,
                signature: 'b'.repeat(128),
            };
            const block = mod.generateSignedLocationBlock('200::1', 2, 1000, provided);
            expect(block.renewalToken).toBe(provided);
        });

        it('lanza si una dirección no es válida', () => {
            expect(() => mod.generateSignedLocationBlock('not-an-address', 1)).toThrow();
        });
    });

    describe('verifyLocationBlock', () => {
        const block: LocationBlock = {
            address: '200::1',
            addresses: ['200::1'],
            dhtSeq: 5,
            signature: 'a'.repeat(128),
            expiresAt: Date.now() + 10000,
        };

        it('devuelve true para un bloque válido', () => {
            expect(mod.verifyLocationBlock('peer-1', block as never, 'aa'.repeat(32))).toBe(true);
        });

        it('rechaza bloques sin expiresAt', () => {
            const { expiresAt: _e, ...noExpiry } = block;
            expect(mod.verifyLocationBlock('peer-1', noExpiry as never, 'aa'.repeat(32))).toBe(false);
        });

        it('rechaza bloques expirados', () => {
            expect(mod.verifyLocationBlock('peer-1', { ...block, expiresAt: Date.now() - 1000 } as never, 'aa'.repeat(32))).toBe(false);
        });

        it('rechaza si la firma no verifica', async () => {
            const identity = await import('../../../src/main_process/security/identity.js');
            vi.mocked(identity.verify).mockReturnValue(false);
            expect(mod.verifyLocationBlock('peer-1', block as never, 'aa'.repeat(32))).toBe(false);
        });

        it('valida el renewalToken cuando está presente y falla si no verifica', async () => {
            const identity = await import('../../../src/main_process/security/identity.js');
            vi.mocked(identity.verify).mockReturnValue(true);
            vi.mocked(renewal.verifyRenewalToken).mockReturnValue(false);
            expect(mod.verifyLocationBlock('peer-1', { ...block, renewalToken: { signature: 'x' } } as never, 'aa'.repeat(32))).toBe(false);
        });

        it('captura errores y devuelve false', async () => {
            const identity = await import('../../../src/main_process/security/identity.js');
            vi.mocked(identity.verify).mockImplementation(() => { throw new Error('bad-signature'); });
            expect(mod.verifyLocationBlock('peer-1', block as never, 'aa'.repeat(32))).toBe(false);
        });
    });

    describe('verifyLocationBlockWithDHT', () => {
        const block: LocationBlock = {
            address: '200::1',
            addresses: ['200::1'],
            dhtSeq: 5,
            signature: 'a'.repeat(128),
            expiresAt: Date.now() + 10000,
        };

        it('devuelve false sin expiresAt', async () => {
            const { expiresAt: _e, ...noExpiry } = block;
            expect(await mod.verifyLocationBlockWithDHT('peer-1', noExpiry as never, 'aa'.repeat(32))).toBe(false);
        });

        it('renueva vía renewalToken cuando está expirado', async () => {
            vi.mocked(renewal.verifyRenewalToken).mockReturnValue(true);
            expect(await mod.verifyLocationBlockWithDHT(
                'peer-1',
                { ...block, expiresAt: Date.now() - 1000, renewalToken: { signature: 'x' } } as never,
                'aa'.repeat(32)
            )).toBe(true);
        });

        it('busca el token en DHT cuando está expirado sin token en bloque', async () => {
            vi.mocked(renewal.verifyRenewalToken).mockReturnValue(true);
            vi.mocked(renewal.findRenewalTokenInDHT).mockResolvedValue({
                targetId: 'peer-1',
                allowedUntil: Date.now() + 1,
                maxRenewals: 3,
                renewalsUsed: 0,
                signature: 'a'.repeat(128),
            });
            expect(await mod.verifyLocationBlockWithDHT(
                'peer-1',
                { ...block, expiresAt: Date.now() - 1000 } as never,
                'aa'.repeat(32)
            )).toBe(true);
        });

        it('rechaza bloque expirado sin renovación posible', async () => {
            vi.mocked(renewal.verifyRenewalToken).mockReturnValue(false);
            vi.mocked(renewal.findRenewalTokenInDHT).mockResolvedValue(null);
            expect(await mod.verifyLocationBlockWithDHT(
                'peer-1',
                { ...block, expiresAt: Date.now() - 1000 } as never,
                'aa'.repeat(32)
            )).toBe(false);
        });

        it('delega en verifyLocationBlock cuando no está expirado', async () => {
            const identity = await import('../../../src/main_process/security/identity.js');
            vi.mocked(identity.verify).mockReturnValue(true);
            expect(await mod.verifyLocationBlockWithDHT('peer-1', block as never, 'aa'.repeat(32))).toBe(true);
        });
    });
});
