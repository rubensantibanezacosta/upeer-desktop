import { spawn } from 'node:child_process';
import { Notification as ElectronNotification } from 'electron';
import { warn } from '../security/secure-logger.js';

const IS_WAYLAND =
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

interface DesktopNotificationOptions {
    title: string;
    body: string;
    onClick: () => void;
}

export function showDesktopNotification(opts: DesktopNotificationOptions): void {
    if (IS_WAYLAND) {
        showWaylandNotification(opts);
        return;
    }
    showElectronNotification(opts);
}

function showWaylandNotification({ title, body, onClick }: DesktopNotificationOptions): void {
    const args = [
        '--app-name', 'uPeer',
        '--action', 'default=Open',
        '--wait',
        title,
        body,
    ];

    const proc = spawn('notify-send', args, {
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    let clicked = false;
    let stdout = '';

    proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
    });

    proc.on('close', () => {
        if (stdout.trim() === 'default' && !clicked) {
            clicked = true;
            onClick();
        }
    });

    proc.on('error', () => {
        warn('notify-send not available, falling back to Electron Notification', {}, 'notifications');
        showElectronNotification({ title, body, onClick });
    });
}

function showElectronNotification({ title, body, onClick }: DesktopNotificationOptions): void {
    if (!ElectronNotification.isSupported()) return;
    const notif = new ElectronNotification({ title, body });
    notif.on('click', onClick);
    notif.show();
}
