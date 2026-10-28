import { spawn } from 'node:child_process';
import { Notification as ElectronNotification, shell } from 'electron';
import { warn } from '../security/secure-logger.js';
import { allowsNotification, notificationSoundEnabled, type NotificationKind } from '../security/notification-prefs.js';
import { createNotificationQueue } from './notificationQueue.js';

const IS_WAYLAND =
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

interface DesktopNotificationOptions {
    kind: NotificationKind;
    title: string;
    body: string;
    onClick: () => void;
}

interface MessageNotificationOptions {
    conversationId: string;
    title: string;
    body: string;
    onClick: () => void;
}

const messageQueue = createNotificationQueue({
    present: group => showDesktopNotification({
        kind: group.kind,
        title: group.title,
        body: group.body,
        onClick: group.onClick,
    }),
});

export function showMessageNotification(opts: MessageNotificationOptions): void {
    if (!allowsNotification('messages')) return;
    messageQueue.push({ kind: 'messages', ...opts });
}

export function flushMessageNotifications(): void {
    messageQueue.flush();
}

export function showDesktopNotification(opts: DesktopNotificationOptions): void {
    if (!allowsNotification(opts.kind)) return;
    playSound();
    if (IS_WAYLAND) {
        showWaylandNotification(opts);
        return;
    }
    showElectronNotification(opts);
}

function playSound(): void {
    if (!notificationSoundEnabled()) return;
    if (typeof shell?.beep !== 'function') return;
    shell.beep();
}

function showWaylandNotification({ title, body, onClick, kind }: DesktopNotificationOptions): void {
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
        showElectronNotification({ title, body, onClick, kind });
    });
}

function showElectronNotification({ title, body, onClick }: DesktopNotificationOptions): void {
    if (!ElectronNotification.isSupported()) return;
    const notif = new ElectronNotification({ title, body });
    notif.on('click', onClick);
    notif.show();
}
