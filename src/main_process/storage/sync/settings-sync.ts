import { getAppSetting, setAppSetting } from '../settings-operations.js';
import { resolveRetentionId } from '../../../utils/retention.js';
import { sanitizeChatIds, sanitizeListName } from '../../../utils/chatLists.js';

export type SettingsBlock = 'privacy' | 'notifications' | 'retention' | 'chat' | 'message' | 'lists' | 'blocked' | 'profile';

export type SettingsValues = Record<string, boolean | string | string[]>;

export type SettingsPatch = {
    block: SettingsBlock;
    entity: string;
    values: SettingsValues;
};

const CLOCK_KEY = 'settings-sync-clock';

const MAX_ID_LENGTH = 200;

export const PROFILE_ALIAS_MAX = 100;

export const PROFILE_AVATAR_MAX = 900_000;

const AVATAR_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const BOOLEAN_BLOCKS: Record<string, readonly string[]> = {
    privacy: ['readReceipts', 'shareActivity'],
    notifications: ['messages', 'requests', 'sound'],
    chat: ['archived', 'muted', 'pinned', 'unread'],
    message: ['starred', 'pinned'],
    blocked: ['blocked'],
};

const ID_FIELD: Record<string, string> = {
    retention: 'chatId',
    chat: 'chatId',
    message: 'messageId',
    lists: 'listId',
    blocked: 'upeerId',
};

const BLOCKS: readonly SettingsBlock[] = ['privacy', 'notifications', 'retention', 'chat', 'message', 'lists', 'blocked', 'profile'];

export function isSettingsBlock(value: unknown): value is SettingsBlock {
    return typeof value === 'string' && (BLOCKS as readonly string[]).includes(value);
}

export function isRendererBlock(value: unknown): boolean {
    return value === 'chat' || value === 'message' || value === 'lists';
}

export function cleanId(value: unknown): string | null {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate || candidate.length > MAX_ID_LENGTH) return null;
    return candidate;
}

export function settingsEntity(block: unknown, payload: Record<string, unknown>): string {
    if (!isSettingsBlock(block)) return '';
    const idField = ID_FIELD[block];
    if (!idField) return block;
    const id = cleanId(payload[idField]);
    return id ? `${block}:${id}` : '';
}

export function sanitizeProfilePatch(entity: string, payload: Record<string, unknown>): SettingsPatch | null {
    const values: SettingsValues = {};
    if (typeof payload.alias === 'string') {
        const alias = payload.alias.trim().slice(0, PROFILE_ALIAS_MAX);
        if (alias) values.alias = alias;
    }
    if (typeof payload.avatar === 'string') {
        const avatar = payload.avatar.trim();
        if (!avatar) values.avatar = '';
        else if (avatar.length <= PROFILE_AVATAR_MAX && AVATAR_PATTERN.test(avatar)) values.avatar = avatar;
    }
    if (Object.keys(values).length === 0) return null;
    return { block: 'profile', entity, values };
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

    if (block === 'profile') return sanitizeProfilePatch(entity, payload);

    if (block === 'lists') {
        const listId = cleanId(payload.listId);
        if (!listId) return null;
        if (payload.deleted === true) return { block, entity, values: { listId, deleted: true } };
        const name = sanitizeListName(payload.name);
        if (!name) return null;
        return { block, entity, values: { listId, name, chatIds: sanitizeChatIds(payload.chatIds) } };
    }

    const idField = ID_FIELD[block];
    const values: SettingsValues = {};
    if (idField) {
        const id = cleanId(payload[idField]);
        if (!id) return null;
        values[idField] = id;
    }
    for (const field of BOOLEAN_BLOCKS[block]) {
        const candidate = payload[field];
        if (typeof candidate === 'boolean') values[field] = candidate;
    }
    if (Object.keys(values).length === (idField ? 1 : 0)) return null;
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
