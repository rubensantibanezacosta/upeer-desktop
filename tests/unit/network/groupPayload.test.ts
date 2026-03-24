import { beforeEach, describe, expect, it, vi } from 'vitest';

const toBufferMock = vi.hoisted(() => vi.fn());
const sharpMock = vi.hoisted(() => vi.fn(() => ({
    rotate: () => ({
        resize: () => ({
            webp: () => ({
                toBuffer: toBufferMock,
            }),
        }),
    }),
})));

vi.mock('sharp', () => ({
    default: sharpMock,
}));

describe('network/groupPayload.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps invite avatar when it already fits', async () => {
        const { buildGroupInvitePayload } = await import('../../../src/main_process/network/groupPayload.js');
        const avatar = `data:image/png;base64,${Buffer.alloc(256, 1).toString('base64')}`;

        const payload = await buildGroupInvitePayload('Grupo', ['a', 'b'], 1, 'c'.repeat(64), avatar);

        expect(JSON.parse(payload)).toEqual({ groupName: 'Grupo', members: ['a', 'b'], epoch: 1, senderKey: 'c'.repeat(64), avatar });
        expect(sharpMock).not.toHaveBeenCalled();
    });

    it('shrinks invite avatar before dropping it', async () => {
        const { buildGroupInvitePayload } = await import('../../../src/main_process/network/groupPayload.js');
        toBufferMock.mockResolvedValue(Buffer.alloc(4_000, 7));
        const avatar = `data:image/png;base64,${Buffer.alloc(70_000, 2).toString('base64')}`;

        const payload = await buildGroupInvitePayload('Grupo', ['a', 'b'], 1, 'c'.repeat(64), avatar);
        const parsed = JSON.parse(payload);

        expect(parsed.groupName).toBe('Grupo');
        expect(parsed.members).toEqual(['a', 'b']);
        expect(parsed.epoch).toBe(1);
        expect(parsed.senderKey).toBe('c'.repeat(64));
        expect(parsed.avatar).toMatch(/^data:image\/webp;base64,/);
    });

    it('drops avatar from group update payload when shrinking fails', async () => {
        const { buildGroupUpdatePayload } = await import('../../../src/main_process/network/groupPayload.js');
        toBufferMock.mockRejectedValue(new Error('sharp-failed'));
        const avatar = `data:image/png;base64,${Buffer.alloc(70_000, 3).toString('base64')}`;

        const payload = await buildGroupUpdatePayload({ groupName: 'Grupo', avatar });

        expect(JSON.parse(payload)).toEqual({ groupName: 'Grupo' });
    });
});