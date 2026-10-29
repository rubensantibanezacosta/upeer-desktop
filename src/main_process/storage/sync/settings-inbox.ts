import { getAppSetting, setAppSetting } from '../settings-operations.js';
import type { SettingsPatch } from './settings-sync.js';

const INBOX_KEY = 'settings-renderer-inbox';

export type PendingSettingsPatch = {
    block: SettingsPatch['block'];
    entity: string;
    values: SettingsPatch['values'];
    occurredAt: number;
};

type Inbox = Record<string, PendingSettingsPatch>;

function readInbox(): Inbox {
    const stored = getAppSetting<Record<string, unknown>>(INBOX_KEY, {});
    const inbox: Inbox = {};
    for (const [entity, value] of Object.entries(stored)) {
        const patch = toPendingPatch(entity, value);
        if (patch) inbox[entity] = patch;
    }
    return inbox;
}

function toPendingPatch(entity: string, value: unknown): PendingSettingsPatch | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    const block = candidate.block;
    if (block !== 'chat' && block !== 'message' && block !== 'lists') return null;
    const values = candidate.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
    const occurredAt = candidate.occurredAt;
    if (typeof occurredAt !== 'number' || !Number.isFinite(occurredAt) || occurredAt <= 0) return null;
    return { block, entity, values: values as SettingsPatch['values'], occurredAt };
}

function writeInbox(inbox: Inbox): void {
    setAppSetting(INBOX_KEY, inbox);
}

export function queueRendererSettingsPatch(patch: SettingsPatch, occurredAt: number): void {
    const inbox = readInbox();
    const previous = inbox[patch.entity];
    if (previous && previous.occurredAt >= occurredAt) return;
    inbox[patch.entity] = {
        block: patch.block,
        entity: patch.entity,
        values: patch.values,
        occurredAt,
    };
    writeInbox(inbox);
}

export function listRendererSettingsPatches(): PendingSettingsPatch[] {
    return Object.values(readInbox()).sort((left, right) => left.occurredAt - right.occurredAt);
}

export function ackRendererSettingsPatch(entity: string, occurredAt: number): boolean {
    const inbox = readInbox();
    const pending = inbox[entity];
    if (!pending || pending.occurredAt > occurredAt) return false;
    delete inbox[entity];
    writeInbox(inbox);
    return true;
}

export function clearRendererSettingsInbox(): void {
    writeInbox({});
}
