import { getAppSetting, setAppSetting } from '../settings-operations.js';

export type SettingsBlock = 'privacy' | 'notifications';

export type SettingsValues = {
    readReceipts?: boolean;
    shareActivity?: boolean;
    messages?: boolean;
    requests?: boolean;
    sound?: boolean;
};

export type SettingsPatch = {
    block: SettingsBlock;
    values: SettingsValues;
};

const CLOCK_KEY = 'settings-sync-clock';

const BLOCK_FIELDS: Record<SettingsBlock, Array<keyof SettingsValues>> = {
    privacy: ['readReceipts', 'shareActivity'],
    notifications: ['messages', 'requests', 'sound'],
};

export function isSettingsBlock(value: unknown): value is SettingsBlock {
    return value === 'privacy' || value === 'notifications';
}

export function sanitizeSettingsPatch(payload: Record<string, unknown>): SettingsPatch | null {
    if (!isSettingsBlock(payload.block)) return null;
    const values: SettingsValues = {};
    for (const field of BLOCK_FIELDS[payload.block]) {
        const candidate = payload[field];
        if (typeof candidate === 'boolean') values[field] = candidate;
    }
    if (Object.keys(values).length === 0) return null;
    return { block: payload.block, values };
}

export function settingsClock(block: SettingsBlock): number {
    const stored = getAppSetting<Record<string, unknown>>(CLOCK_KEY, {});
    const value = stored[block];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function setSettingsClock(block: SettingsBlock, occurredAt: number): void {
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) return;
    const stored = getAppSetting<Record<string, unknown>>(CLOCK_KEY, {});
    setAppSetting(CLOCK_KEY, { ...stored, [block]: occurredAt });
}

export function claimSettingsUpdate(block: SettingsBlock, occurredAt: number): boolean {
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) return false;
    return occurredAt > settingsClock(block);
}
