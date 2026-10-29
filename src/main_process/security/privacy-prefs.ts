import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';

export type PrivacyPrefs = {
    readReceipts: boolean;
    onlineStatus: boolean;
    lastSeen: boolean;
    shareActivity: boolean;
};

const SETTING_KEY = 'privacy-prefs';

const DEFAULTS: PrivacyPrefs = {
    readReceipts: true,
    onlineStatus: true,
    lastSeen: true,
    shareActivity: true,
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
        shareActivity: asBoolean(stored.shareActivity, DEFAULTS.shareActivity),
    };
}

export function setPrivacyPrefs(patch: Partial<PrivacyPrefs>): PrivacyPrefs {
    const current = getPrivacyPrefs();
    const next: PrivacyPrefs = {
        readReceipts: asBoolean(patch.readReceipts, current.readReceipts),
        onlineStatus: asBoolean(patch.onlineStatus, current.onlineStatus),
        lastSeen: asBoolean(patch.lastSeen, current.lastSeen),
        shareActivity: asBoolean(patch.shareActivity, current.shareActivity),
    };
    setAppSetting(SETTING_KEY, next);
    return next;
}

export function readReceiptsEnabled(): boolean {
    return getPrivacyPrefs().readReceipts;
}

export function activitySharingEnabled(): boolean {
    return getPrivacyPrefs().shareActivity;
}
