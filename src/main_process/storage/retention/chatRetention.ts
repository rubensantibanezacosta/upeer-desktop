import { getAppSetting, setAppSetting } from '../settings-operations.js';
import { emitSyncEvent } from '../sync/eventSink.js';
import { setSettingsClock } from '../sync/settings-sync.js';
import { computeExpiresAt, resolveRetentionId, retentionMs, sanitizeRetentionMap } from '../../../utils/retention.js';
import type { RetentionId } from '../../../utils/retention.js';

const SETTING_KEY = 'chat-retention';

function settingsEntityFor(chatId: string): string {
    return `retention:${chatId}`;
}

let cache: Record<string, RetentionId> | null = null;

export function getRetentionMap(): Record<string, RetentionId> {
    if (cache) return cache;
    cache = sanitizeRetentionMap(getAppSetting<unknown>(SETTING_KEY, {}));
    return cache;
}

export function getChatRetentionId(chatId?: string | null): RetentionId {
    if (!chatId) return 'off';
    return getRetentionMap()[chatId] ?? 'off';
}

export function getChatRetentionMs(chatId?: string | null): number {
    return retentionMs(getChatRetentionId(chatId));
}

export function expiresAtForMessage(chatId: string, timestamp: number): number | null {
    return computeExpiresAt(timestamp, getChatRetentionMs(chatId));
}

export function setChatRetention(chatId: string, id: string): Record<string, RetentionId> {
    const resolved = resolveRetentionId(id);
    const current = getRetentionMap();
    const previous = current[chatId];
    const next = { ...current };

    if (resolved === 'off') {
        delete next[chatId];
    } else {
        next[chatId] = resolved;
    }

    cache = next;
    setAppSetting(SETTING_KEY, next);

    if (previous !== (resolved === 'off' ? undefined : resolved)) {
        setSettingsClock(settingsEntityFor(chatId), Date.now());
        emitSyncEvent('SETTINGS_UPDATE', { block: 'retention', chatId, retention: resolved });
    }

    return next;
}

export function applyRetentionFromSync(chatId: string, retention: string, occurredAt: number): Record<string, RetentionId> {
    const resolved = resolveRetentionId(retention);
    const next = { ...getRetentionMap() };

    if (resolved === 'off') {
        delete next[chatId];
    } else {
        next[chatId] = resolved;
    }

    cache = next;
    setAppSetting(SETTING_KEY, next);
    setSettingsClock(settingsEntityFor(chatId), occurredAt);
    return next;
}

export function resetRetentionCache(): void {
    cache = null;
}
