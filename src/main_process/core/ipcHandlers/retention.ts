import { ipcMain } from 'electron';
import { getRetentionMap, setChatRetention } from '../../storage/retention/chatRetention.js';
import { RETENTION_PRESETS, resolveRetentionId, retentionMs } from '../../../utils/retention.js';
import { sweepExpiredMessages } from '../../storage/retention/expirySweeper.js';

export function registerRetentionHandlers(): void {
    ipcMain.handle('get-chat-retention', () => ({
        map: getRetentionMap(),
        presets: RETENTION_PRESETS.map(({ id, label, ms }) => ({ id, label, ms })),
    }));

    ipcMain.handle('set-chat-retention', (_event, { chatId, retention }: { chatId: string; retention: string }) => {
        if (typeof chatId !== 'string' || !chatId) {
            return { ok: false, map: getRetentionMap(), expiredChats: [] as string[] };
        }

        const id = resolveRetentionId(retention);
        const map = setChatRetention(chatId, id);

        if (retentionMs(id) === 0) {
            return { ok: true, map, expiredChats: [] as string[] };
        }

        return { ok: true, map, expiredChats: sweepExpiredMessages() };
    });
}
