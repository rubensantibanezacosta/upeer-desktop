import { ipcMain } from 'electron';
import { emitSyncEvent } from '../../storage/sync/eventSink.js';
import { isRendererBlock, sanitizeSettingsPatch, setSettingsClock } from '../../storage/sync/settings-sync.js';

export function registerSettingsSyncHandlers(): void {
    ipcMain.handle('emit-settings-patch', (_event, payload: Record<string, unknown>) => {
        const patch = sanitizeSettingsPatch(payload ?? {});
        if (!patch || !isRendererBlock(patch.block)) return { ok: false };
        setSettingsClock(patch.entity, Date.now());
        emitSyncEvent('SETTINGS_UPDATE', { block: patch.block, ...patch.values });
        return { ok: true };
    });
}
