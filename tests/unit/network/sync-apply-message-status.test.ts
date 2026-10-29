import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncPlainEvent } from '../../../src/main_process/network/sync/types.js';

const store = vi.hoisted(() => ({ saved: [] as { status: string }[] }));

vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({
    upsertSyncMessage: (message: { status: string }) => {
        store.saved.push(message);
        return { applied: true, inserted: true };
    },
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessageLocally: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    getMessageById: vi.fn(),
    updateMessageContent: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({}));
vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    deleteReaction: vi.fn(),
    saveReaction: vi.fn(),
}));
vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    upsertGroupMetadata: vi.fn(),
}));
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    applyBlockedFromSync: vi.fn(() => true),
    getContactByUpeerId: vi.fn(() => null),
    setContactFavorite: vi.fn(),
    updateContactAvatar: vi.fn(),
    updateContactName: vi.fn(),
}));
vi.mock('../../../src/main_process/security/identity.js', () => ({
    getAlias: () => '',
    setAlias: vi.fn(),
    getAvatar: () => '',
    setAvatar: vi.fn(),
}));

function upsert(status: unknown): SyncPlainEvent {
    return {
        eventId: `history-m-${String(status)}`,
        kind: 'MESSAGE_UPSERT',
        occurredAt: 2_000,
        sequence: 2_000,
        payload: {
            id: 'm1',
            chatUpeerId: 'c'.repeat(64),
            message: 'hola desde el movil',
            status,
            timestamp: 2_000,
        },
    } as SyncPlainEvent;
}

describe('applySyncEvent con mensajes del histórico', () => {
    beforeEach(() => {
        store.saved.length = 0;
    });

    it('conserva los estados que el escritorio ya conoce', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');

        await applySyncEvent(upsert('delivered'), null);

        expect(store.saved[0]?.status).toBe('delivered');
    });

    it('adopta como enviado el mensaje que el movil aun tiene en cola', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');

        await applySyncEvent(upsert('pending'), null);

        expect(store.saved[0]?.status).toBe('sent');
    });

    it('no descarta el mensaje por un estado desconocido', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');

        const applied = await applySyncEvent(upsert('inventado'), null);

        expect(applied).toBe(true);
        expect(store.saved[0]?.status).toBe('sent');
    });
});
