import { ipcMain } from 'electron';
import { getRetentionMap, setChatRetention } from '../../storage/retention/chatRetention.js';
import { RETENTION_PRESETS, resolveRetentionId, retentionMs } from '../../../utils/retention.js';
import { sweepExpiredMessages } from '../../storage/retention/expirySweeper.js';

async function announceRetention(chatId: string, retention: string): Promise<void> {
    if (chatId.startsWith('grp-')) return;
    try {
        const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
        const contact = getContactByUpeerId(chatId);
        if (!contact?.address) return;
        const { sendSecurePacket } = await import('../../network/server/transport.js');
        sendSecurePacket(contact.address, { type: 'RETENTION_SET', retention }, contact.publicKey ?? undefined);
    } catch (cause) {
        console.warn('No se pudo anunciar el plazo de los mensajes temporales.', cause);
    }
}

export function registerRetentionHandlers(): void {
    ipcMain.handle('get-chat-retention', () => ({
        map: getRetentionMap(),
        presets: RETENTION_PRESETS.map(({ id, label, ms }) => ({ id, label, ms })),
    }));

    ipcMain.handle('set-chat-retention', async (_event, { chatId, retention }: { chatId: string; retention: string }) => {
        if (typeof chatId !== 'string' || !chatId) {
            return { ok: false, map: getRetentionMap(), expiredChats: [] as string[] };
        }

        const id = resolveRetentionId(retention);
        const map = setChatRetention(chatId, id);
        await announceRetention(chatId, id);

        if (retentionMs(id) === 0) {
            return { ok: true, map, expiredChats: [] as string[] };
        }

        return { ok: true, map, expiredChats: sweepExpiredMessages() };
    });
}
