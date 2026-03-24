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

describe('network/messagePayload.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps the preview image when it already fits', async () => {
        const { buildMessagePayload } = await import('../../../src/main_process/network/messagePayload.js');
        const imageBase64 = `data:image/png;base64,${Buffer.alloc(256, 1).toString('base64')}`;

        const payload = await buildMessagePayload('hola https://example.com', {
            url: 'https://example.com',
            title: 'Example',
            imageBase64,
        });

        expect(JSON.parse(payload)).toEqual({
            text: 'hola https://example.com',
            linkPreview: {
                url: 'https://example.com',
                title: 'Example',
                imageBase64,
            },
        });
        expect(sharpMock).not.toHaveBeenCalled();
    });

    it('shrinks the preview image before dropping it', async () => {
        const { buildMessagePayload } = await import('../../../src/main_process/network/messagePayload.js');
        toBufferMock.mockResolvedValue(Buffer.alloc(5_000, 7));
        const imageBase64 = `data:image/png;base64,${Buffer.alloc(70_000, 2).toString('base64')}`;

        const payload = await buildMessagePayload('hola https://example.com', {
            url: 'https://example.com',
            title: 'Example',
            description: 'Preview',
            imageBase64,
        });

        const parsed = JSON.parse(payload);
        expect(parsed.text).toBe('hola https://example.com');
        expect(parsed.linkPreview.url).toBe('https://example.com');
        expect(parsed.linkPreview.imageBase64).toMatch(/^data:image\/webp;base64,/);
        expect(parsed.linkPreview.imageBase64).not.toBe(imageBase64);
        expect(sharpMock).toHaveBeenCalled();
    });

    it('removes only the image when shrinking fails', async () => {
        const { buildMessagePayload } = await import('../../../src/main_process/network/messagePayload.js');
        toBufferMock.mockRejectedValue(new Error('sharp-failed'));
        const imageBase64 = `data:image/png;base64,${Buffer.alloc(70_000, 3).toString('base64')}`;

        const payload = await buildMessagePayload('hola https://example.com', {
            url: 'https://example.com',
            title: 'Example',
            description: 'Preview',
            domain: 'example.com',
            imageBase64,
        });

        expect(JSON.parse(payload)).toEqual({
            text: 'hola https://example.com',
            linkPreview: {
                url: 'https://example.com',
                title: 'Example',
                description: 'Preview',
                domain: 'example.com',
            },
        });
    });
});
