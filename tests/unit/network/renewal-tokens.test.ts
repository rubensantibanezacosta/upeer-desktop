import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    sign: vi.fn(() => Buffer.from('sig') as unknown as Buffer),
    verify: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    network: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/cryptoUtils.js', () => ({
    canonicalStringify: vi.fn((d: unknown) => JSON.stringify(d)),
    safeBufferFromHex: vi.fn((v: string) => Buffer.from(v, 'hex')),
}));

type RenewalToken = {
    targetId: string;
    allowedUntil: number;
    maxRenewals: number;
    renewalsUsed: number;
    signature: string;
};

function makeToken(overrides: Partial<RenewalToken> = {}): RenewalToken {
    return {
        targetId: 'target-1',
        allowedUntil: Date.now() + 1000000,
        maxRenewals: 3,
        renewalsUsed: 0,
        signature: 'a'.repeat(128),
        ...overrides,
    };
}

describe('renewalTokens', () => {
    let mod: typeof import('../../../src/main_process/network/renewalTokens.js');
    let identity: typeof import('../../../src/main_process/security/identity.js');
    let dhtShared: typeof import('../../../src/main_process/network/dht/shared.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        mod = await import('../../../src/main_process/network/renewalTokens.js');
        identity = await import('../../../src/main_process/security/identity.js');
        dhtShared = await import('../../../src/main_process/network/dht/shared.js');
    });

    describe('generateRenewalToken', () => {
        it('genera un token firmado con allowedUntil futuro', () => {
            const token = mod.generateRenewalToken('target-1', 3);
            expect(token.targetId).toBe('target-1');
            expect(token.maxRenewals).toBe(3);
            expect(token.renewalsUsed).toBe(0);
            expect(token.allowedUntil).toBeGreaterThan(Date.now());
            expect(identity.sign).toHaveBeenCalled();
        });
    });

    describe('verifyRenewalToken', () => {
        it('devuelve true si la firma es válida y no expiró', () => {
            vi.mocked(identity.verify).mockReturnValue(true);
            expect(mod.verifyRenewalToken(makeToken(), 'aa'.repeat(32))).toBe(true);
        });

        it('rechaza token expirado o sin renovaciones', () => {
            expect(mod.verifyRenewalToken(makeToken({ allowedUntil: Date.now() - 1 }), 'aa'.repeat(32))).toBe(false);
            expect(mod.verifyRenewalToken(makeToken({ renewalsUsed: 3, maxRenewals: 3 }), 'aa'.repeat(32))).toBe(false);
        });

        it('rechaza si la firma no verifica', () => {
            vi.mocked(identity.verify).mockReturnValue(false);
            expect(mod.verifyRenewalToken(makeToken(), 'aa'.repeat(32))).toBe(false);
        });
    });

    describe('canRenewLocationBlock', () => {
        it('devuelve false sin renewalToken', () => {
            expect(mod.canRenewLocationBlock({}, 'aa'.repeat(32))).toBe(false);
        });

        it('devuelve false si queda más tiempo que el umbral', () => {
            const token = makeToken();
            expect(mod.canRenewLocationBlock({ expiresAt: Date.now() + 100000000, renewalToken: token }, 'aa'.repeat(32))).toBe(false);
        });

        it('renueva cuando está cerca de expirar', () => {
            vi.mocked(identity.verify).mockReturnValue(true);
            const token = makeToken({ renewalsUsed: 0, maxRenewals: 3 });
            expect(mod.canRenewLocationBlock({ expiresAt: Date.now() + 1000, renewalToken: token }, 'aa'.repeat(32))).toBe(true);
        });
    });

    describe('renewLocationBlock', () => {
        const block = { address: '200::1', dhtSeq: 5, signature: 'b'.repeat(128), renewalToken: makeToken() };

        it('devuelve null si no se puede renovar', () => {
            vi.mocked(identity.verify).mockReturnValue(false);
            expect(mod.renewLocationBlock(block, 'aa'.repeat(32))).toBeNull();
        });

        it('incrementa renewalsUsed y devuelve el bloque renovado', () => {
            vi.mocked(identity.verify).mockReturnValue(true);
            const token = makeToken({ renewalsUsed: 0, maxRenewals: 3 });
            const result = mod.renewLocationBlock({ ...block, renewalToken: token }, 'aa'.repeat(32));
            expect(result).not.toBeNull();
            expect(result?.renewalToken?.renewalsUsed).toBe(1);
        });
    });

    describe('createRenewalTokenKey', () => {
        it('deriva una clave determinista sha256', () => {
            const k1 = mod.createRenewalTokenKey('target-1', 'sig-prefix');
            const k2 = mod.createRenewalTokenKey('target-1', 'sig-prefix');
            expect(k1).toEqual(k2);
            expect(k1.length).toBe(32);
        });
    });

    describe('storeRenewalTokenInDHT', () => {
        it('devuelve false sin kademlia', async () => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
            expect(await mod.storeRenewalTokenInDHT(makeToken())).toBe(false);
        });

        it('almacena y devuelve true con kademlia', async () => {
            const storeValue = vi.fn().mockResolvedValue(undefined);
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({ storeValue } as never);
            expect(await mod.storeRenewalTokenInDHT(makeToken())).toBe(true);
            expect(storeValue).toHaveBeenCalled();
        });

        it('devuelve false si storeValue lanza', async () => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
                storeValue: vi.fn().mockRejectedValue(new Error('dht-down')),
            } as never);
            expect(await mod.storeRenewalTokenInDHT(makeToken())).toBe(false);
        });
    });

    describe('findRenewalTokenInDHT', () => {
        it('devuelve null sin kademlia', async () => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
            expect(await mod.findRenewalTokenInDHT('target-1')).toBeNull();
        });

        it('devuelve el token encontrado', async () => {
            const token = makeToken();
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
                findValue: vi.fn().mockResolvedValue({ value: token }),
            } as never);
            expect(await mod.findRenewalTokenInDHT('target-1')).toEqual(token);
        });

        it('devuelve null si no hay valor', async () => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
                findValue: vi.fn().mockResolvedValue(null),
            } as never);
            expect(await mod.findRenewalTokenInDHT('target-1')).toBeNull();
        });
    });

    describe('canRenewLocationBlockWithDHT', () => {
        it('usa el token del bloque si existe', async () => {
            vi.mocked(identity.verify).mockReturnValue(true);
            expect(await mod.canRenewLocationBlockWithDHT({ renewalToken: makeToken() }, 'aa'.repeat(32), 'target-1')).toBe(true);
        });

        it('busca en DHT si no hay token y devuelve false si no se encuentra', async () => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
                findValue: vi.fn().mockResolvedValue(null),
            } as never);
            expect(await mod.canRenewLocationBlockWithDHT({}, 'aa'.repeat(32), 'target-1')).toBe(false);
        });
    });
});
