import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';

export type PrivacyPrefs = {
    readReceipts: boolean;
    onlineStatus: boolean;
    lastSeen: boolean;
};

const SETTING_KEY = 'privacy-prefs';

const DEFAULTS: PrivacyPrefs = {
    readReceipts: true,
    onlineStatus: true,
    lastSeen: true,
};

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

export function getPrivacyPrefs(): PrivacyPrefs {
    const stored = getAppSetting<Partial<PrivacyPrefs>>(SETTING_KEY, {});
    return {
        readReceipts: asBoolean(stored.readReceipts, DEFAULTS.readReceipts),
        onlineStatus: asBoolean(stored.onlineStatus, DEFAULTS.onlineStatus),
        lastSeen: asBoolean(stored.lastSeen, DEFAULTS.lastSeen),
    };
}

export function setPrivacyPrefs(patch: Partial<PrivacyPrefs>): PrivacyPrefs {
    const current = getPrivacyPrefs();
    const next: PrivacyPrefs = {
        readReceipts: asBoolean(patch.readReceipts, current.readReceipts),
        onlineStatus: asBoolean(patch.onlineStatus, current.onlineStatus),
        lastSeen: asBoolean(patch.lastSeen, current.lastSeen),
    };
    setAppSetting(SETTING_KEY, next);
    return next;
}

export function readReceiptsEnabled(): boolean {
    return getPrivacyPrefs().readReceipts;
}
