import { FileTransfer } from './types.js';
import { saveFileMessage, updateMessageStatus } from '../../storage/messages/operations.js';
import { warn } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';

export async function saveTransferToDB(transfer: FileTransfer) {
    try {
        const myId = getMyUPeerId();
        const isSelf = transfer.upeerId === myId;
        const chatUpeerId = transfer.chatUpeerId || transfer.upeerId;
        const messageId = transfer.messageId || transfer.fileId;
        const displayFileId = transfer.messageId || transfer.fileId;

        // Skip duplicates for self-transfers
        if (isSelf && transfer.direction === 'receiving') return;
        if (transfer.persistMessage === false) return;

        // Correct arguments for saveFileMessage in storage/messages/operations.ts
        const persistedPath = transfer.direction === 'sending'
            ? transfer.filePath
            : transfer.tempPath;

        await saveFileMessage(
            messageId,
            chatUpeerId,
            transfer.direction === 'sending' || isSelf,
            transfer.fileName,
            displayFileId,
            transfer.fileSize,
            transfer.mimeType,
            persistedPath,
            undefined, // signature
            isSelf ? 'read' : (transfer.state === 'completed' ? 'delivered' : 'sent'),
            transfer.direction === 'sending' || isSelf ? myId : transfer.upeerId,
            undefined, // timestamp
            transfer.thumbnail,
            transfer.caption,
            transfer.isVoiceNote
        );
    } catch (err) {
        warn('Failed to save file transfer to DB', err, 'file-transfer');
    }
}

export async function updateTransferMessageStatus(fileId: string, status: string) {
    try {
        return await updateMessageStatus(fileId, status as any);
    } catch (err) {
        warn('Failed to update file transfer status in DB', err, 'file-transfer');
        return false;
    }
}
