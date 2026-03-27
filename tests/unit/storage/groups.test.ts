import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as groupsOps from '../../../src/main_process/storage/groups/operations.js';

// Mocks para drizzle/sqlite
const mockRun = vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }));
const mockGet = vi.fn();
const mockAll = vi.fn();

const mockDb = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    get: mockGet,
    all: mockAll,
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    onConflictDoUpdate: vi.fn(() => mockDb),
    run: mockRun,
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
};

const mockSchema = {
    groups: {
        groupId: 'groupId',
        name: 'name',
        adminUpeerId: 'adminUpeerId',
        members: 'members',
        isFavorite: 'isFavorite',
        status: 'status',
        epoch: 'epoch',
        senderKey: 'senderKey',
        senderKeyCreatedAt: 'senderKeyCreatedAt',
        createdAt: 'createdAt',
        avatar: 'avatar'
    },
    messages: {
        chatUpeerId: 'chatUpeerId',
        timestamp: 'timestamp',
        message: 'message'
    }
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: unknown, b: unknown) => ({ column: a, value: b }),
    desc: (a: unknown) => ({ column: a, order: 'desc' })
}));

describe('Groups Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRun.mockReset();
        mockGet.mockReset();
        mockAll.mockReset();
    });

    it('should save or update a group', () => {
        groupsOps.saveGroup('group1', 'Test Group', 'admin1', ['admin1', 'user2'], 'active', undefined, {
            epoch: 1,
            senderKey: 'a'.repeat(64),
            senderKeyCreatedAt: 123
        });

        expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.groups);
        expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalled();
    });

    it('should get group by ID and parse members', () => {
        const rawGroup = {
            groupId: 'group1',
            name: 'Test',
            members: '["user1", "user2"]',
            status: 'active'
        };
        mockGet.mockReturnValueOnce(rawGroup);

        const result = groupsOps.getGroupById('group1');

        expect(result?.members).toEqual(['user1', 'user2']);
        expect(result?.name).toBe('Test');
    });

    it('should list all groups with last message', () => {
        const rawGroups = [
            { groupId: 'g1', name: 'G1', members: '[]', status: 'active', isFavorite: true },
            { groupId: 'g2', name: 'G2', members: '[]', status: 'active' }
        ];
        mockAll.mockReturnValueOnce(rawGroups);

        // Mocking last message for each group
        mockGet.mockReturnValueOnce({ message: 'Last msg G1', timestamp: 1000 });
        mockGet.mockReturnValueOnce({ message: 'Last msg G2', timestamp: 2000 });

        const result = groupsOps.getGroups();

        expect(result.length).toBe(2);
        expect(result[1].isFavorite).toBe(true);
        // Debería estar ordenado por tB - tA (más reciente primero)
        expect(result[0].groupId).toBe('g2');
        expect(result[1].groupId).toBe('g1');
    });

    it('should update group members', () => {
        groupsOps.updateGroupMembers('group1', ['user1', 'user3']);

        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ members: '["user1","user3"]' });
        expect(mockRun).toHaveBeenCalled();
    });

    it('should update group crypto state', () => {
        groupsOps.updateGroupCrypto('group1', { epoch: 2, senderKey: 'b'.repeat(64), senderKeyCreatedAt: 456 });

        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ epoch: 2, senderKey: 'b'.repeat(64), senderKeyCreatedAt: 456 });
        expect(mockRun).toHaveBeenCalled();
    });

    it('should delete a group', () => {
        groupsOps.deleteGroup('group1');
        expect(mockDb.delete).toHaveBeenCalled();
        expect(mockDb.where).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalled();
    });

    it('should update group info (name, avatar)', () => {
        groupsOps.updateGroupInfo('group1', { name: 'New Name', avatar: 'new-avatar' });
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ name: 'New Name', avatar: 'new-avatar' });

        // Empty set check
        vi.clearAllMocks();
        groupsOps.updateGroupInfo('group1', {});
        expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should update group avatar specifically', () => {
        groupsOps.updateGroupAvatar('group1', 'avatar-data');
        expect(mockDb.set).toHaveBeenCalledWith({ avatar: 'avatar-data' });
    });

    it('should update group status', () => {
        groupsOps.updateGroupStatus('group1', 'invited');
        expect(mockDb.set).toHaveBeenCalledWith({ status: 'invited' });
    });

    it('should update favorite flag for a group', () => {
        groupsOps.setGroupFavorite('group1', true);
        expect(mockDb.set).toHaveBeenCalledWith({ isFavorite: true });
    });

    it('should handle member parsing error', () => {
        const rawGroup = { groupId: 'g1', name: 'G1', members: 'invalid-json', status: 'active' };
        mockGet.mockReturnValueOnce(rawGroup);
        const result = groupsOps.getGroupById('g1');
        expect(result?.members).toEqual([]);
    });

    it('should handle avatar being null in updateGroupInfo', () => {
        groupsOps.updateGroupInfo('group1', { avatar: null });
        expect(mockDb.set).toHaveBeenCalledWith({ avatar: null });
    });
});
