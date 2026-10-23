import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessageLocally: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    getMessageById: vi.fn(),
    updateMessageContent: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    deleteReaction: vi.fn(),
    saveReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({
    upsertSyncMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    upsertGroupMetadata: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    setContactFavorite: vi.fn(),
    updateContactAvatar: vi.fn(),
    updateContactName: vi.fn(),
}));

import { applySyncEvent } from '../../../src/main_process/network/sync/apply.js';
import { deleteGroup, upsertGroupMetadata } from '../../../src/main_process/storage/groups/operations.js';
import {
    getContactByUpeerId,
    setContactFavorite,
    updateContactAvatar,
    updateContactName,
} from '../../../src/main_process/storage/contacts/operations.js';

const win = { webContents: { send: vi.fn() } } as never;

const groupPayload = {
    groupId: 'group-1',
    name: 'Equipo',
    adminUpeerId: 'a'.repeat(64),
    members: ['a'.repeat(64), 'b'.repeat(64)],
    status: 'active',
    isFavorite: true,
    avatar: null,
    createdAt: 1_000,
};

describe('Sync metadata events', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('upserts group metadata from a synced event', async () => {
        const applied = await applySyncEvent({ eventId: 'e1', kind: 'GROUP_UPSERT', occurredAt: 1, sequence: 1, payload: groupPayload }, win);
        expect(applied).toBe(true);
        expect(upsertGroupMetadata).toHaveBeenCalledWith(groupPayload);
    });

    it('rejects group metadata with invalid members', async () => {
        const applied = await applySyncEvent({
            eventId: 'e1',
            kind: 'GROUP_UPSERT',
            occurredAt: 1,
            sequence: 1,
            payload: { ...groupPayload, members: ['ok', 7] },
        }, win);
        expect(applied).toBe(false);
        expect(upsertGroupMetadata).not.toHaveBeenCalled();
    });

    it('rejects group metadata with an unknown status', async () => {
        const applied = await applySyncEvent({
            eventId: 'e1',
            kind: 'GROUP_UPSERT',
            occurredAt: 1,
            sequence: 1,
            payload: { ...groupPayload, status: 'archived' },
        }, win);
        expect(applied).toBe(false);
    });

    it('deletes a group from a synced event', async () => {
        const applied = await applySyncEvent({
            eventId: 'e2',
            kind: 'GROUP_DELETE',
            occurredAt: 1,
            sequence: 2,
            payload: { groupId: 'group-1' },
        }, win);
        expect(applied).toBe(true);
        expect(deleteGroup).toHaveBeenCalledWith('group-1');
    });

    it('ignores the profile of a contact that is not present locally', async () => {
        vi.mocked(getContactByUpeerId).mockReturnValue(undefined);
        const applied = await applySyncEvent({
            eventId: 'e3',
            kind: 'CONTACT_PROFILE',
            occurredAt: 1,
            sequence: 3,
            payload: { upeerId: 'c'.repeat(64), name: 'Carol' },
        }, win);
        expect(applied).toBe(false);
        expect(updateContactName).not.toHaveBeenCalled();
    });

    it('updates the local profile of an existing contact', async () => {
        vi.mocked(getContactByUpeerId).mockReturnValue({ upeerId: 'c'.repeat(64) } as never);
        const applied = await applySyncEvent({
            eventId: 'e4',
            kind: 'CONTACT_PROFILE',
            occurredAt: 1,
            sequence: 4,
            payload: { upeerId: 'c'.repeat(64), name: 'Carol', avatar: 'data:image/png;base64,AAAA', isFavorite: true },
        }, win);
        expect(applied).toBe(true);
        expect(updateContactName).toHaveBeenCalledWith('c'.repeat(64), 'Carol');
        expect(updateContactAvatar).toHaveBeenCalled();
        expect(setContactFavorite).toHaveBeenCalledWith('c'.repeat(64), true);
    });
});
