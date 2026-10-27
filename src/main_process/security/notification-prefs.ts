import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';

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

export function getNotificationPrefs(): NotificationPrefs {
    const stored = getAppSetting<Partial<NotificationPrefs>>(SETTING_KEY, {});
    return {
        messages: asBoolean(stored.messages, DEFAULTS.messages),
        requests: asBoolean(stored.requests, DEFAULTS.requests),
        sound: asBoolean(stored.sound, DEFAULTS.sound),
    };
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
    const current = getNotificationPrefs();
    const next: NotificationPrefs = {
        messages: asBoolean(patch.messages, current.messages),
        requests: asBoolean(patch.requests, current.requests),
        sound: asBoolean(patch.sound, current.sound),
    };
    setAppSetting(SETTING_KEY, next);
    return next;
}

export function allowsNotification(kind: NotificationKind): boolean {
    return getNotificationPrefs()[kind];
}

export function notificationSoundEnabled(): boolean {
    return getNotificationPrefs().sound;
}
