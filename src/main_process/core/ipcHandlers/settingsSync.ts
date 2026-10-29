import { ipcMain } from 'electron';
import { emitSyncEvent } from '../../storage/sync/eventSink.js';
import { ackRendererSettingsPatch, listRendererSettingsPatches } from '../../storage/sync/settings-inbox.js';
import { isRendererBlock, sanitizeSettingsPatch, setSettingsClock } from '../../storage/sync/settings-sync.js';

export function registerSettingsSyncHandlers(): void {
    ipcMain.handle('emit-settings-patch', (_event, payload: Record<string, unknown>) => {
        const patch = sanitizeSettingsPatch(payload ?? {});
        if (!patch || !isRendererBlock(patch.block)) return { ok: false };
        setSettingsClock(patch.entity, Date.now());
        emitSyncEvent('SETTINGS_UPDATE', { block: patch.block, ...patch.values });
        return { ok: true };
    });

    ipcMain.handle('get-pending-settings-patches', () => ({ patches: listRendererSettingsPatches() }));

    ipcMain.handle('ack-settings-patch', (_event, payload: { entity?: unknown; occurredAt?: unknown }) => {
        const entity = typeof payload?.entity === 'string' ? payload.entity : '';
        const occurredAt = typeof payload?.occurredAt === 'number' ? payload.occurredAt : 0;
        if (!entity || occurredAt <= 0) return { ok: false };
        return { ok: ackRendererSettingsPatch(entity, occurredAt) };
    });
}
