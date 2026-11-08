import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * La dirección del contacto tiene que viajar en el perfil sincronizado.
 *
 * Fallo real del 08/11: `listContactProfiles` devolvía solo upeerId, nombre, avatar, favorito y clave.
 * La dirección **no se sincronizaba nunca**, así que el resto de dispositivos de la cuenta se quedaban
 * sin ella. Se veía en el móvil: cuatro contactos, tres con la dirección vacía, y por eso las llamadas
 * a esos contactos no salían («sin dirección conocida») sin ningún error visible.
 */
const mockRows: unknown[] = [];

const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    all: vi.fn(() => mockRows),
};

const mockSchema = { contacts: { upeerId: 'upeerId' } };

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: unknown, b: unknown) => ({ column: a, value: b }),
}));

const A = 'a'.repeat(64);
const KEY = 'b'.repeat(64);

describe('listContactProfiles: la dirección viaja', () => {
    beforeEach(() => {
        mockRows.length = 0;
    });

    it('incluye la dirección principal y las conocidas', async () => {
        mockRows.push({
            upeerId: A,
            name: 'Rubén Portátil',
            avatar: null,
            isFavorite: false,
            publicKey: KEY,
            address: '200:7bba::1',
            knownAddresses: '["200:a15e::2","200:7bba::1"]',
        });
        const { listContactProfiles } = await import('../../../src/main_process/storage/contacts/operations.js');

        const [profile] = listContactProfiles();

        expect(profile.address).toBe('200:7bba::1');
        // La principal va primera y sin repetirse en las conocidas: sin deduplicar el receptor acabaría
        // ofreciendo la llamada dos veces al mismo dispositivo.
        expect(profile.knownAddresses).toEqual(['200:7bba::1', '200:a15e::2']);
    });

    it('sin dirección principal usa las conocidas', async () => {
        mockRows.push({
            upeerId: A,
            name: 'Contacto',
            avatar: null,
            isFavorite: false,
            publicKey: null,
            address: '',
            knownAddresses: '["200:a15e::2"]',
        });
        const { listContactProfiles } = await import('../../../src/main_process/storage/contacts/operations.js');

        const [profile] = listContactProfiles();

        // Antes esto salía vacío y el otro dispositivo no podía llamar a este contacto.
        expect(profile.address).toBeNull();
        expect(profile.knownAddresses).toEqual(['200:a15e::2']);
    });

    it('un JSON de direcciones corrupto no rompe la sincronización', async () => {
        mockRows.push({
            upeerId: A,
            name: 'Contacto',
            avatar: null,
            isFavorite: false,
            publicKey: null,
            address: '200:7bba::1',
            knownAddresses: '{no es json',
        });
        const { listContactProfiles } = await import('../../../src/main_process/storage/contacts/operations.js');

        const [profile] = listContactProfiles();

        expect(profile.address).toBe('200:7bba::1');
        expect(profile.knownAddresses).toEqual(['200:7bba::1']);
    });

    it('sin ninguna dirección el perfil sigue saliendo', async () => {
        mockRows.push({
            upeerId: A,
            name: 'Contacto',
            avatar: null,
            isFavorite: false,
            publicKey: null,
            address: null,
            knownAddresses: '[]',
        });
        const { listContactProfiles } = await import('../../../src/main_process/storage/contacts/operations.js');

        const [profile] = listContactProfiles();

        // Nombre y clave siguen sincronizándose aunque no haya dirección.
        expect(profile.name).toBe('Contacto');
        expect(profile.address).toBeNull();
        expect(profile.knownAddresses).toEqual([]);
    });

    it('descarta entradas que no son cadenas', async () => {
        mockRows.push({
            upeerId: A,
            name: 'Contacto',
            avatar: null,
            isFavorite: false,
            publicKey: null,
            address: '200:7bba::1',
            knownAddresses: '["200:a15e::2", 42, null, ""]',
        });
        const { listContactProfiles } = await import('../../../src/main_process/storage/contacts/operations.js');

        const [profile] = listContactProfiles();

        expect(profile.knownAddresses).toEqual(['200:7bba::1', '200:a15e::2']);
    });
});
