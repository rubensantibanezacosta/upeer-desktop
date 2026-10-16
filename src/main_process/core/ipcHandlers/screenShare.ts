import { desktopCapturer, ipcMain, type BrowserWindow, type DesktopCapturerSource } from 'electron';

type ScreenShareSource = { id: string; name: string; type: 'screen' | 'window'; thumbnail: string; appIcon: string | null };
type PendingSelection = { sources: Map<string, DesktopCapturerSource>; selected: DesktopCapturerSource | null; timeout: NodeJS.Timeout; captureRequested: boolean; resolveCapture: (() => void) | null; rejectCapture: ((error: Error) => void) | null };

const pendingSelections = new Map<number, PendingSelection>();

export function registerScreenShareHandlers(): void {
    ipcMain.handle('get-screen-share-sources', async (event) => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 640, height: 360 }, fetchWindowIcons: true });
            replacePendingSelection(event.sender.id, sources);
            return { success: true, sources: sources.map(toScreenShareSource) };
        } catch (cause) {
            console.error('[Call] No se pudieron obtener fuentes para compartir pantalla', cause);
            return { success: false, sources: [], error: 'No se pudieron obtener las fuentes de pantalla.' };
        }
    });

    ipcMain.handle('select-screen-share-source', (event, sourceId: string) => {
        const pending = pendingSelections.get(event.sender.id);
        const source = pending?.sources.get(sourceId);
        if (!pending || !source) return { success: false };
        pending.selected = source;
        event.sender.send('screen-share-source-selected', source.id);
        return { success: true };
    });

    ipcMain.handle('request-screen-share-capture', async (event) => {
        const pending = pendingSelections.get(event.sender.id);
        if (!pending?.selected) return { success: false };
        pending.captureRequested = true;
        const captured = new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => resolve(false), 10_000);
            pending.resolveCapture = () => {
                clearTimeout(timeout);
                pending.resolveCapture = null;
                pending.rejectCapture = null;
                resolve(true);
            };
            pending.rejectCapture = (error) => {
                clearTimeout(timeout);
                pending.resolveCapture = null;
                pending.rejectCapture = null;
                reject(error);
            };
        });
        event.sender.send('request-screen-share-capture');
        return { success: await captured };
    });

    ipcMain.handle('cancel-screen-share-selection', (event) => {
        event.sender.send('screen-share-source-selected', null);
        clearPendingScreenShare(event.sender.id);
        return { success: true };
    });
}

export function setupScreenSharePicker(mainWindow: BrowserWindow): void {
    mainWindow.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
        const senderId = mainWindow.webContents.id;
        const pending = pendingSelections.get(senderId);
        if (!pending) {
            callback({});
            return;
        }
        const source = pending.captureRequested ? pending.selected : null;
        pendingSelections.delete(senderId);
        clearTimeout(pending.timeout);
        callback(source ? { video: source } : {});
        pending.resolveCapture?.();
        pending.rejectCapture?.(new Error('Screen share selection was cancelled'));
        if (!pending.captureRequested) mainWindow.webContents.send('screen-share-source-selected', null);
    });
}

export function clearPendingScreenShare(webContentsId: number): void {
    const pending = pendingSelections.get(webContentsId);
    if (!pending) return;
    pendingSelections.delete(webContentsId);
    clearTimeout(pending.timeout);
    pending.rejectCapture?.(new Error('Screen share selection was cancelled'));
}

function toScreenShareSource(source: DesktopCapturerSource): ScreenShareSource {
    return {
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon?.toDataURL() ?? null,
    };
}

function replacePendingSelection(senderId: number, sources: DesktopCapturerSource[]): void {
    const existing = pendingSelections.get(senderId);
    if (existing) clearTimeout(existing.timeout);
    const pending: PendingSelection = { sources: new Map(sources.map((source) => [source.id, source])), selected: null, timeout: setTimeout(() => pendingSelections.delete(senderId), 120_000), captureRequested: false, resolveCapture: null, rejectCapture: null };
    pendingSelections.set(senderId, pending);
}
