import { getMainWindow } from '../../core/windowManager.js';

export function sendCallRendererEvent(
    eventName: string,
    data: { callId: string; peerUpeerId: string; connectedAt?: number; reason?: string },
): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(eventName, data);
    }
}