import { fileTransferManager } from './transfer-manager.js';

export function countActiveFileTransfers(): number {
    let active = 0;
    for (const transfer of fileTransferManager.store.getAllTransfers()) {
        if (transfer.state === 'pending' || transfer.state === 'active') active += 1;
    }
    return active;
}
