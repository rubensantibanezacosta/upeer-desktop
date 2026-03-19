import { describe, it, expect } from 'vitest';
import { parseMessage } from '../../../../../src/features/chat/message/MessageItem';

describe('MessageItem: parseMessage logic', () => {
    it('should correctly prioritize savedPath and filePath for sending/receiving', () => {
        const fileId = 'test-id';
        const fileName = 'test-image.jpg';
        const filePath = '/original/path/to/image.jpg';
        const tempPath = '/temp/received/image.jpg';
        const savedPath = '/home/user/Downloads/final-image.jpg';

        const rawMessage = JSON.stringify({
            type: 'file',
            fileId,
            fileName,
            fileSize: 1024,
            mimeType: 'image/jpeg',
            fileHash: 'hash123',
            filePath, // Original path (sender)
            tempPath,  // Temp path (receiver)
            savedPath  // Final path (after save dialog)
        });

        // Caso 1: Soy el emisor. Debe usar savedPath si existe, o filePath original.
        const outgoing = parseMessage(rawMessage, true, []);
        expect(outgoing.fileData.direction).toBe('sending');
        // El emisor debe tener acceso a su archivo original aunque no haya savedPath
        expect(outgoing.fileData.savedPath).toBe(savedPath); 

        // Caso 2: Emisor sin savedPath aún (recién enviado)
        const rawNoSaved = JSON.stringify({
            type: 'file',
            fileId,
            fileName,
            fileSize: 1024,
            mimeType: 'image/jpeg',
            filePath
        });
        const outgoingNew = parseMessage(rawNoSaved, true, []);
        expect(outgoingNew.fileData.savedPath).toBe(filePath);

        // Caso 3: Soy el receptor. Debe usar savedPath si existe, o tempPath. Sin nada, undefined.
        const incoming = parseMessage(rawMessage, false, []);
        expect(incoming.fileData.direction).toBe( 'receiving');
        expect(incoming.fileData.savedPath).toBe(savedPath);

        // Caso 4: Receptor sin savedPath aún (solo tempPath)
        const rawIncomingNew = JSON.stringify({
            type: 'file',
            fileId,
            fileName,
            fileSize: 1024,
            mimeType: 'image/jpeg',
            tempPath
        });
        const incomingNew = parseMessage(rawIncomingNew, false, []);
        expect(incomingNew.fileData.savedPath).toBe(tempPath);
    });

    it('should include thumbnail and caption in parsed data', () => {
        const thumbnailData = 'data:image/jpeg;base64,abc';
        const captionText = 'Nice view';
        const rawMessage = JSON.stringify({
            type: 'file',
            fileId: '1',
            fileName: 'img.jpg',
            thumbnail: thumbnailData,
            caption: captionText
        });

        const parsed = parseMessage(rawMessage, true, []);
        expect(parsed.fileData.thumbnail).toBe(thumbnailData);
        expect(parsed.fileData.caption).toBe(captionText);
    });

    it('should recover state from active transfers if available', () => {
        const fileId = 'active-file';
        const rawMessage = JSON.stringify({
            type: 'file',
            fileId,
            fileName: 'active.jpg'
        });

        const activeTransfers = [
            {
                fileId,
                direction: 'sending',
                state: 'active',
                progress: 45,
                filePath: '/original/active.jpg'
            }
        ];

        const parsed = parseMessage(rawMessage, true, activeTransfers);
        expect(parsed.fileData.transferState).toBe('active');
        expect(parsed.fileData.progress).toBe(45);
        expect(parsed.fileData.savedPath).toBe('/original/active.jpg');
    });
});
