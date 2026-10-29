import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactRecord = { upeerId: 'x', name: '', alias: '' };

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(async () => contactRecord),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => 'f'.repeat(64),
    getAlias: () => '',
}));

describe('groupActorName', () => {
    beforeEach(() => {
        contactRecord.name = '';
        contactRecord.alias = '';
    });

    it('usa el nombre guardado del contacto', async () => {
        contactRecord.name = 'Ivan';
        const { groupActorName } = await import('../../../src/main_process/network/handlers/groupActorName.js');
        expect(await groupActorName('x')).toBe('Ivan');
    });

    it('prefiere el nombre que ya trae la llamada', async () => {
        const { groupActorName } = await import('../../../src/main_process/network/handlers/groupActorName.js');
        expect(await groupActorName('x', 'Ana')).toBe('Ana');
    });

    it('no enseña el identificador completo cuando el actor es mi propia cuenta', async () => {
        const { groupActorName } = await import('../../../src/main_process/network/handlers/groupActorName.js');
        expect(await groupActorName('f'.repeat(64))).toBe('Tu otro dispositivo');
    });

    it('no enseña el identificador cuando el actor es desconocido', async () => {
        const { groupActorName } = await import('../../../src/main_process/network/handlers/groupActorName.js');
        const unknown = 'abcdef0123456789'.repeat(4);
        expect(await groupActorName(unknown)).toBe('Alguien');
    });
});
