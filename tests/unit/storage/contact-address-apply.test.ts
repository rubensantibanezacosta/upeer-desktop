import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El escritorio tiene que **aplicar** la dirección que llega en un perfil sincronizado.
 *
 * El escritorio solo aprendía la dirección de un contacto cuando ese contacto le mandaba un paquete
 * (`handlers.ts`: `directContact && contact.address !== rinfo.address`). Con varios dispositivos de la
 * misma cuenta eso no basta: el móvil ve al escritorio, pero el escritorio no ve al móvil, así que la
 * fila del móvil se quedaba vacía y desde ahí se repartía vacía a todos los demás.
 *
 * Arreglar solo el emisor (`listContactProfiles`) no bastaba: el receptor tampoco aplicaba nada.
 */
type Row = { address: string | null; knownAddresses: string | null } | undefined;

const state: { row: Row; updates: Record<string, unknown>[] } = { row: undefined, updates: [] };

const mockDb = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    get: vi.fn(() => state.row),
    update: vi.fn(() => mockDb),
    set: vi.fn((values: Record<string, unknown>) => {
        state.updates.push(values);
        return mockDb;
    }),
    run: vi.fn(() => ({ changes: 1 })),
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => ({ contacts: { upeerId: 'upeerId', address: 'address', knownAddresses: 'knownAddresses', lastSeen: 'lastSeen' } }),
    eq: (a: unknown, b: unknown) => ({ column: a, value: b }),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    // La validación de verdad vive en utils; aquí basta con el prefijo de Yggdrasil.
    isYggdrasilAddress: (value: unknown) => typeof value === 'string' && /^[23][0-9a-fA-F]{2}:/.test(value),
}));

const A = 'a'.repeat(64);
const MOVIL = '200:7bba:1d01:9bb7:78bc:beae:f64a:6d59';
const CASA = '200:a15e:1111:2222:3333:4444:5555:723a';

async function applyAddresses(primary: unknown, known: unknown) {
    const { applyContactProfileAddresses } = await import('../../../src/main_process/storage/contacts/operations.js');
    return applyContactProfileAddresses(A, primary, known);
}

describe('applyContactProfileAddresses', () => {
    beforeEach(() => {
        state.row = undefined;
        state.updates = [];
        mockDb.run.mockClear();
    });

    it('rellena una dirección vacía con la que llega', async () => {
        // El caso del bug: la fila del móvil estaba sin dirección y el escritorio la dejaba así.
        state.row = { address: '', knownAddresses: '[]' };

        expect(await applyAddresses(MOVIL, [MOVIL])).toBe(true);
        expect(state.updates[0].address).toBe(MOVIL);
        expect(JSON.parse(String(state.updates[0].knownAddresses))).toEqual([MOVIL]);
    });

    it('no pisa una dirección que ya funciona con una que llega sin principal', async () => {
        state.row = { address: CASA, knownAddresses: JSON.stringify([CASA]) };

        await applyAddresses(null, []);

        // Nada que aplicar: se queda como estaba.
        expect(state.updates).toHaveLength(0);
    });

    it('fusiona las conocidas nuevas sin perder las que había', async () => {
        state.row = { address: CASA, knownAddresses: JSON.stringify([CASA]) };

        expect(await applyAddresses(MOVIL, [MOVIL])).toBe(true);

        const merged = JSON.parse(String(state.updates[0].knownAddresses));
        expect(merged).toContain(MOVIL);
        expect(merged).toContain(CASA);
    });

    it('mantiene la principal si sigue en la lista', async () => {
        state.row = { address: CASA, knownAddresses: JSON.stringify([CASA]) };

        await applyAddresses(CASA, [CASA, MOVIL]);

        expect(state.updates[0].address).toBe(CASA);
    });

    it('descarta direcciones que no son de Yggdrasil', async () => {
        state.row = { address: '', knownAddresses: '[]' };

        expect(await applyAddresses('192.168.1.1', ['no es una direccion', ''])).toBe(false);
        expect(state.updates).toHaveLength(0);
    });

    it('un perfil sin dirección no cambia nada', async () => {
        state.row = { address: CASA, knownAddresses: JSON.stringify([CASA]) };

        expect(await applyAddresses(undefined, undefined)).toBe(false);
        expect(state.updates).toHaveLength(0);
    });

    it('no falla si el contacto no existe', async () => {
        state.row = undefined;

        expect(await applyAddresses(MOVIL, [MOVIL])).toBe(false);
    });

    it('un JSON de conocidas corrupto no impide aplicar la nueva', async () => {
        state.row = { address: '', knownAddresses: '{roto' };

        expect(await applyAddresses(MOVIL, [MOVIL])).toBe(true);
        expect(state.updates[0].address).toBe(MOVIL);
    });

    it('no repite la misma dirección en la lista', async () => {
        state.row = { address: '', knownAddresses: '[]' };

        await applyAddresses(MOVIL, [MOVIL, MOVIL, MOVIL]);

        expect(JSON.parse(String(state.updates[0].knownAddresses))).toEqual([MOVIL]);
    });
});
