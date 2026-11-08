import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El applier de sincronización tiene que **aplicar la dirección** de un `CONTACT_PROFILE`.
 *
 * Cubre el cable, no solo la función suelta: `applyContactProfileAddresses` tiene sus propias pruebas,
 * pero quitar la llamada de `apply.ts` no rompía ninguna — el fallo se colaba entero porque el único
 * test del applier mockea el módulo y nunca lo ejecuta.
 */
const calls = {
    names: [] as string[],
    favorites: [] as boolean[],
    addresses: [] as { upeerId: string; primary: unknown; known: unknown }[],
};

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: () => ({ upeerId: 'a'.repeat(64) }),
    updateContactName: (upeerId: string, name: string) => { calls.names.push(`${upeerId}:${name}`); },
    updateContactAvatar: () => undefined,
    setContactFavorite: (_upeerId: string, value: boolean) => { calls.favorites.push(value); },
    applyContactProfileAddresses: (upeerId: string, primary: unknown, known: unknown) => {
        calls.addresses.push({ upeerId, primary, known });
        return true;
    },
    applyBlockedFromSync: () => undefined,
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessageLocally: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    getMessageById: vi.fn(),
    updateMessageContent: vi.fn(),
    updateMessageStatus: vi.fn(),
}));
vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({ deleteReaction: vi.fn(), saveReaction: vi.fn() }));
vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({ deleteGroup: vi.fn(), upsertGroupMetadata: vi.fn() }));
vi.mock('../../../src/main_process/storage/sync/eventSink.js', () => ({ withSyncEventSuppressionAsync: async (fn: () => unknown) => fn() }));
vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({ upsertSyncMessage: vi.fn() }));
vi.mock('../../../src/main_process/storage/sync/settings-inbox.js', () => ({ queueRendererSettingsPatch: vi.fn() }));
vi.mock('../../../src/main_process/storage/sync/settings.js', () => ({
    claimSettingsUpdate: vi.fn(() => true),
    sanitizeSettingsPatch: vi.fn((value: unknown) => value),
    setSettingsClock: vi.fn(),
}));

const A = 'a'.repeat(64);
const MOVIL = '200:7bba:1d01:9bb7:78bc:beae:f64a:6d59';

describe('applySyncEventOutcome: CONTACT_PROFILE con dirección', () => {
    beforeEach(() => {
        calls.names.length = 0;
        calls.favorites.length = 0;
        calls.addresses.length = 0;
    });

    it('aplica la dirección que viene en el perfil', async () => {
        const { applySyncEventOutcome } = await import('../../../src/main_process/network/sync/apply.js');

        const outcome = await applySyncEventOutcome({
            eventId: 'profile-a',
            kind: 'CONTACT_PROFILE',
            occurredAt: 1,
            sequence: 1,
            originDeviceId: 'dev',
            payload: { upeerId: A, name: 'Rubén Portátil', address: MOVIL, knownAddresses: [MOVIL] },
        } as never, null);

        expect(outcome).toBe('applied');
        // Sin esta llamada, el escritorio se quedaba sin la dirección del móvil y la repartía vacía.
        expect(calls.addresses).toHaveLength(1);
        expect(calls.addresses[0]).toEqual({ upeerId: A, primary: MOVIL, known: [MOVIL] });
    });

    it('un perfil que solo trae la dirección también cuenta como aplicado', async () => {
        const { applySyncEventOutcome } = await import('../../../src/main_process/network/sync/apply.js');

        const outcome = await applySyncEventOutcome({
            eventId: 'profile-b',
            kind: 'CONTACT_PROFILE',
            occurredAt: 1,
            sequence: 2,
            originDeviceId: 'dev',
            payload: { upeerId: A, address: MOVIL, knownAddresses: [MOVIL] },
        } as never, null);

        // Antes esto devolvía 'unchanged' porque no había nombre ni avatar que aplicar.
        expect(outcome).toBe('applied');
        expect(calls.addresses).toHaveLength(1);
    });

    it('sigue aplicando nombre y favorito', async () => {
        const { applySyncEventOutcome } = await import('../../../src/main_process/network/sync/apply.js');

        await applySyncEventOutcome({
            eventId: 'profile-c',
            kind: 'CONTACT_PROFILE',
            occurredAt: 1,
            sequence: 3,
            originDeviceId: 'dev',
            payload: { upeerId: A, name: 'Nuevo', isFavorite: true },
        } as never, null);

        expect(calls.names).toEqual([`${A}:Nuevo`]);
        expect(calls.favorites).toEqual([true]);
    });
});
