import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';
import { emitSyncEvent } from '../storage/sync/eventSink.js';
import { setSettingsClock } from '../storage/sync/settings-sync.js';

export type PrivacyPrefs = {
    readReceipts: boolean;
    shareActivity: boolean;
};

const SETTING_KEY = 'privacy-prefs';

const DEFAULTS: PrivacyPrefs = {
    readReceipts: true,
    shareActivity: true,
};

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function merge(patch: Partial<PrivacyPrefs>): PrivacyPrefs {
    const current = getPrivacyPrefs();
    return {
        readReceipts: asBoolean(patch.readReceipts, current.readReceipts),
        shareActivity: asBoolean(patch.shareActivity, current.shareActivity),
    };
}

export function getPrivacyPrefs(): PrivacyPrefs {
    const stored = getAppSetting<Partial<PrivacyPrefs>>(SETTING_KEY, {});
    return {
        readReceipts: asBoolean(stored.readReceipts, DEFAULTS.readReceipts),
        shareActivity: asBoolean(stored.shareActivity, DEFAULTS.shareActivity),
    };
}

export function setPrivacyPrefs(patch: Partial<PrivacyPrefs>): PrivacyPrefs {
    const next = merge(patch);
    setAppSetting(SETTING_KEY, next);
    setSettingsClock('privacy', Date.now());
    emitSyncEvent('SETTINGS_UPDATE', { block: 'privacy', ...next });
    return next;
}

export function applyPrivacyFromSync(patch: Partial<PrivacyPrefs>, occurredAt: number): PrivacyPrefs {
    const next = merge(patch);
    setAppSetting(SETTING_KEY, next);
    setSettingsClock('privacy', occurredAt);
    return next;
}

export function readReceiptsEnabled(): boolean {
    return getPrivacyPrefs().readReceipts;
}

export function activitySharingEnabled(): boolean {
    return getPrivacyPrefs().shareActivity;
}
