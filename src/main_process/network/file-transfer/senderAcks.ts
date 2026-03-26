import { warn, debug } from '../../security/secure-logger.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { TransferPhase } from './types.js';
import { updateTransferMessageStatus } from './db-helper.js';
import { verifyFileTransferPacketSignature } from './signature.js';
import type { TransferManager } from './transfer-manager.js';

export async function handleAccept(this: TransferManager, upeerId: string, address: string, data: any) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact?.publicKey) return;

    if (data.signature && !verifyFileTransferPacketSignature(data, contact.publicKey)) {
        warn('Invalid FILE_ACCEPT signature', { fileId: data.fileId }, 'security');
        return;
    }

    const transfer = this.store.getTransfer(data.fileId, 'sending');
    if (!transfer || (
        transfer.phase !== TransferPhase.PROPOSED &&
        transfer.phase !== TransferPhase.REPLICATING &&
        transfer.phase !== TransferPhase.VAULTED
    )) return;

    const updated = this.store.updateTransfer(data.fileId, 'sending', { phase: TransferPhase.TRANSFERRING, state: 'active' });
    if (updated) {
        this.ui.notifyProgress(updated, true);
        const messageId = updated.messageId || data.fileId;
        if (await updateTransferMessageStatus(messageId, 'delivered')) {
            this.ui.safeSend('message-delivered', { id: messageId, upeerId });
            this.ui.notifyStatusUpdated(messageId, 'delivered');
        }
        this.sendNextChunks(updated);
    }
}

export async function handleAck(this: TransferManager, upeerId: string, address: string, data: any) {
    const transfer = this.store.getTransfer(data.fileId, 'sending');
    if (!transfer || (transfer.state !== 'active' && transfer.state !== 'completed')) return;

    debug('FILE_ACK received', {
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        upeerId,
        address
    }, 'file-transfer');

    this.clearRetryTimer(data.fileId, data.chunkIndex);

    if (!(transfer as any)._ackedChunks) (transfer as any)._ackedChunks = new Set<number>();
    const ackedChunks = (transfer as any)._ackedChunks as Set<number>;
    ackedChunks.add(data.chunkIndex);

    const sentTime = (transfer as any)._chunksSentTimes?.get(data.chunkIndex);
    const updates: any = {
        chunksProcessed: ackedChunks.size
    };

    if (sentTime) {
        const rtt = Date.now() - sentTime;
        const srtt = transfer.srtt || 500;
        const newSrtt = Math.round(0.9 * srtt + 0.1 * rtt);
        const newRto = Math.min(10000, Math.max(1000, newSrtt * 2));
        updates.srtt = newSrtt;
        updates.rto = newRto;

        let windowSize = transfer.windowSize || this.config.initialWindowSize || 64;
        const ssthresh = transfer.ssthresh || 1024;
        const growthFactor = newSrtt < 150 ? 2.0 : 1.0;

        if (windowSize < ssthresh) {
            windowSize = Math.min(ssthresh, windowSize + Math.floor(growthFactor));
        } else {
            windowSize += (1.0 / windowSize) * growthFactor;
        }

        updates.windowSize = Math.min(this.config.maxWindowSize, Math.floor(windowSize));
        (transfer as any)._chunksSentTimes.delete(data.chunkIndex);
    }

    const updated = this.store.updateTransfer(data.fileId, 'sending', updates);

    if (updated) {
        this.ui.notifyProgress(updated);
        if (ackedChunks.size === updated.totalChunks) {
            const contact = await getContactByUpeerId(upeerId);
            const freshAddress = contact?.address || address;
            const doneMsg = { type: 'FILE_DONE', fileId: data.fileId };
            this.send(freshAddress, doneMsg, contact?.publicKey);
            this.startDoneRetry(data.fileId, upeerId, doneMsg);
        } else if ((updated.nextChunkIndex || 0) < updated.totalChunks) {
            await this.sendNextChunks(updated);
        }
    }
}