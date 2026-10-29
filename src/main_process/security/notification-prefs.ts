import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';
import { emitSyncEvent } from '../storage/sync/eventSink.js';
import { setSettingsClock } from '../storage/sync/settings-sync.js';

export type NotificationPrefs = {
    messages: boolean;
    requests: boolean;
    sound: boolean;
};

export type NotificationKind = 'messages' | 'requests';

const SETTING_KEY = 'notification-prefs';

const DEFAULTS: NotificationPrefs = {
    messages: true,
    requests: true,
    sound: true,
};

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function merge(patch: Partial<NotificationPrefs>): NotificationPrefs {
    const current = getNotificationPrefs();
    return {
        messages: asBoolean(patch.messages, current.messages),
        requests: asBoolean(patch.requests, current.requests),
        sound: asBoolean(patch.sound, current.sound),
    };
}

export function getNotificationPrefs(): NotificationPrefs {
    const stored = getAppSetting<Partial<NotificationPrefs>>(SETTING_KEY, {});
    return {
        messages: asBoolean(stored.messages, DEFAULTS.messages),
        requests: asBoolean(stored.requests, DEFAULTS.requests),
        sound: asBoolean(stored.sound, DEFAULTS.sound),
    };
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
    const next = merge(patch);
    setAppSetting(SETTING_KEY, next);
    setSettingsClock('notifications', Date.now());
    emitSyncEvent('SETTINGS_UPDATE', { block: 'notifications', ...next });
    return next;
}

export function applyNotificationFromSync(patch: Partial<NotificationPrefs>, occurredAt: number): NotificationPrefs {
    const next = merge(patch);
    setAppSetting(SETTING_KEY, next);
    setSettingsClock('notifications', occurredAt);
    return next;
}

export function allowsNotification(kind: NotificationKind): boolean {
    return getNotificationPrefs()[kind];
}

export function notificationSoundEnabled(): boolean {
    return getNotificationPrefs().sound;
}
