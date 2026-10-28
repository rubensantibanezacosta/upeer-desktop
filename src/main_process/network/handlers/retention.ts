import { getMainWindow } from '../../core/windowManager.js';
import { resolveRetentionId } from '../../../utils/retention.js';

export function handleRetentionSet(upeerId: string, data: { retention?: unknown }): void {
    if (!upeerId) return;
    const retention = resolveRetentionId(typeof data.retention === 'string' ? data.retention : null);
    void (async () => {
        try {
            const { setChatRetention } = await import('../../storage/retention/chatRetention.js');
            const { sweepExpiredMessages } = await import('../../storage/retention/expirySweeper.js');
            setChatRetention(upeerId, retention);
            sweepExpiredMessages();
            getMainWindow()?.webContents.send('retention-updated', { chatId: upeerId, retention });
        } catch (cause) {
            console.warn('No se pudo aplicar el plazo de conservación recibido.', cause);
        }
    })();
}
