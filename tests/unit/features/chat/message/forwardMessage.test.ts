import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardMessageToTargets, parseForwardPayload } from '../../../../../src/features/chat/message/forwardMessage.js';

describe('forwardMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (window as any).upeer = {
            sendMessage: vi.fn(),
            sendGroupMessage: vi.fn(),
            persistInternalAsset: vi.fn(),
            startFileTransfer: vi.fn(),
        };
    });

    it('parses link preview payloads as text messages with preview', () => {
        const preview = { url: 'https://example.com', title: 'Example' };
        const result = parseForwardPayload(JSON.stringify({ text: 'hola', linkPreview: preview }));

        expect(result).toEqual({
            kind: 'text',
            content: 'hola',
            linkPreview: preview,
        });
    });

    it('parses file payloads preserving caption and local path', () => {
        const result = parseForwardPayload(JSON.stringify({
            type: 'file',
            fileName: 'foto.png',
            savedPath: '/tmp/foto.png',
            caption: 'bonita',
            thumbnail: 'thumb',
        }));

        expect(result).toEqual({
            kind: 'file',
            fileName: 'foto.png',
            filePath: '/tmp/foto.png',
            caption: 'bonita',
            thumbnail: 'thumb',
            isVoiceNote: false,
        });
    });

    it('forwards text messages to direct chats and groups preserving preview', async () => {
        const preview = { url: 'https://example.com', title: 'Example' };
        (window as any).upeer.sendMessage.mockResolvedValue({ id: 'm1', savedMessage: 'hola', timestamp: 1 });
        (window as any).upeer.sendGroupMessage.mockResolvedValue({ id: 'g1', savedMessage: 'hola', timestamp: 1 });

        const result = await forwardMessageToTargets(
            JSON.stringify({ text: 'hola', linkPreview: preview }),
            [
                { id: 'peer-1', isGroup: false },
                { id: 'grp-1', isGroup: true },
            ],
        );

        expect(window.upeer.sendMessage).toHaveBeenCalledWith('peer-1', 'hola', undefined, preview);
        expect(window.upeer.sendGroupMessage).toHaveBeenCalledWith('grp-1', 'hola', undefined, preview);
        expect(result).toEqual({ forwarded: 2, failed: 0 });
    });

    it('copies the local file and starts a fresh transfer for each target', async () => {
        (window as any).upeer.persistInternalAsset.mockResolvedValue({ success: true, path: '/assets/copied.png' });
        (window as any).upeer.startFileTransfer.mockResolvedValue({ success: true, fileId: 'file-1' });

        const result = await forwardMessageToTargets(
            JSON.stringify({
                type: 'file',
                fileName: 'foto.png',
                savedPath: '/downloads/foto.png',
                thumbnail: 'thumb',
                caption: 'bonita',
            }),
            [
                { id: 'peer-1', isGroup: false },
                { id: 'grp-1', isGroup: true },
            ],
        );

        expect(window.upeer.persistInternalAsset).toHaveBeenCalledWith({
            filePath: '/downloads/foto.png',
            fileName: 'foto.png',
        });
        expect(window.upeer.startFileTransfer).toHaveBeenNthCalledWith(1, 'peer-1', '/assets/copied.png', 'thumb', 'bonita', false, 'foto.png');
        expect(window.upeer.startFileTransfer).toHaveBeenNthCalledWith(2, 'grp-1', '/assets/copied.png', 'thumb', 'bonita', false, 'foto.png');
        expect(result).toEqual({ forwarded: 2, failed: 0 });
    });

    it('fails gracefully when a file message has no local path left', async () => {
        const result = await forwardMessageToTargets(
            JSON.stringify({
                type: 'file',
                fileName: 'foto.png',
            }),
            [{ id: 'peer-1', isGroup: false }],
        );

        expect(window.upeer.persistInternalAsset).not.toHaveBeenCalled();
        expect(window.upeer.startFileTransfer).not.toHaveBeenCalled();
        expect(result).toEqual({ forwarded: 0, failed: 1 });
    });
});
