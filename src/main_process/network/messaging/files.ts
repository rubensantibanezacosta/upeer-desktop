import { getContactByUpeerId } from '../../storage/db.js';
import { warn } from '../../security/secure-logger.js';
import { fileTransferManager } from '../file-transfer/index.js';

export async function sendFile(upeerId: string, filePath: string, thumbnail?: string): Promise<string | undefined> {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return undefined;

    try {
        const fileId = await fileTransferManager.startSend(
            upeerId,
            contact.address,
            filePath,
            thumbnail
        );
        return fileId;
    } catch (error) {
        warn('File transfer failed to start', { upeerId, filePath, error }, 'file-transfer');
        return undefined;
    }
}