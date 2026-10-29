import { getAppSetting, setAppSetting } from '../settings-operations.js';
import { resolveRetentionId } from '../../../utils/retention.js';

export type SettingsBlock = 'privacy' | 'notifications' | 'retention' | 'chat';

export type SettingsValues = Record<string, boolean | string>;

export type SettingsPatch = {
    block: SettingsBlock;
    entity: string;
    values: SettingsValues;
};

const CLOCK_KEY = 'settings-sync-clock';

const MAX_ID_LENGTH = 200;

const BOOLEAN_FIELDS: Record<'privacy' | 'notifications', readonly string[]> = {
    privacy: ['readReceipts', 'shareActivity'],
    notifications: ['messages', 'requests', 'sound'],
};

const CHAT_FIELDS = ['archived', 'muted', 'pinned', 'unread'] as const;

export function isSettingsBlock(value: unknown): value is SettingsBlock {
    return value === 'privacy' || value === 'notifications' || value === 'retention' || value === 'chat';
}

export function isRendererBlock(value: unknown): boolean {
    return value === 'chat';
}

export function cleanId(value: unknown): string | null {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate || candidate.length > MAX_ID_LENGTH) return null;
    return candidate;
}

export function settingsEntity(block: unknown, payload: Record<string, unknown>): string {
    if (!isSettingsBlock(block)) return '';
    if (block === 'privacy' || block === 'notifications') return block;
    const id = cleanId(payload.chatId);
    return id ? `${block}:${id}` : '';
}

export function sanitizeSettingsPatch(payload: Record<string, unknown>): SettingsPatch | null {
    const block = payload.block;
    if (!isSettingsBlock(block)) return null;
    const entity = settingsEntity(block, payload);
    if (!entity) return null;

    if (block === 'retention') {
        const chatId = cleanId(payload.chatId);
        if (!chatId) return null;
        const retention = resolveRetentionId(typeof payload.retention === 'string' ? payload.retention : null);
        return { block, entity, values: { chatId, retention } };
    }

    if (block === 'chat') {
        const chatId = cleanId(payload.chatId);
        if (!chatId) return null;
        const values: SettingsValues = { chatId };
        for (const field of CHAT_FIELDS) {
            const candidate = payload[field];
            if (typeof candidate === 'boolean') values[field] = candidate;
        }
        if (Object.keys(values).length === 1) return null;
        return { block, entity, values };
    }

    const values: SettingsValues = {};
    for (const field of BOOLEAN_FIELDS[block]) {
        const candidate = payload[field];
        if (typeof candidate === 'boolean') values[field] = candidate;
    }
    if (Object.keys(values).length === 0) return null;
    return { block, entity, values };
}

export function settingsClock(entity: string): number {
    const stored = getAppSetting<Record<string, unknown>>(CLOCK_KEY, {});
    const value = stored[entity];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function setSettingsClock(entity: string, occurredAt: number): void {
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) return;
    const stored = getAppSetting<Record<string, unknown>>(CLOCK_KEY, {});
    setAppSetting(CLOCK_KEY, { ...stored, [entity]: occurredAt });
}

export function claimSettingsUpdate(entity: string, occurredAt: number): boolean {
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) return false;
    return occurredAt > settingsClock(entity);
}
