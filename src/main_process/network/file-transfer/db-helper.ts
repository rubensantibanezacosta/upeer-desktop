import { FileTransfer } from './types.js';
import { saveFileMessage, updateMessageStatus } from '../../storage/messages/operations.js';
import { warn } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';

export async function saveTransferToDB(transfer: FileTransfer) {
    try {
        const myId = getMyUPeerId();
        const isSelf = transfer.upeerId === myId;

        // Skip duplicates for self-transfers
        if (isSelf && transfer.direction === 'receiving') return;

        // Correct arguments for saveFileMessage in storage/messages/operations.ts
        await saveFileMessage(
            transfer.fileId,
            transfer.upeerId,
            transfer.direction === 'sending' || isSelf,
            transfer.fileName,
            transfer.fileId,
            transfer.fileSize,
            transfer.mimeType,
            transfer.filePath,
            undefined, // signature
            isSelf ? 'read' : (transfer.state === 'completed' ? 'delivered' : 'sent'),
            myId, // senderUpeerId
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
