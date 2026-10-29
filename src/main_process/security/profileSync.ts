import { emitSyncEvent } from '../storage/sync/eventSink.js';
import { PROFILE_ALIAS_MAX, setSettingsClock } from '../storage/sync/settings-sync.js';
import { getAlias, getAvatar, setAlias, setAvatar } from './identity.js';

export type SyncedProfile = { alias: string; avatar: string };

export function emitProfileSettings(): void {
    setSettingsClock('profile', Date.now());
    emitSyncEvent('SETTINGS_UPDATE', {
        block: 'profile',
        alias: getAlias().slice(0, PROFILE_ALIAS_MAX),
        avatar: getAvatar(),
    });
}

export function applyProfileFromSync(values: Record<string, unknown>, occurredAt: number): SyncedProfile {
    const alias = typeof values.alias === 'string' ? values.alias.trim().slice(0, PROFILE_ALIAS_MAX) : '';
    if (alias) setAlias(alias);
    if (typeof values.avatar === 'string') setAvatar(values.avatar);
    setSettingsClock('profile', occurredAt);
    return { alias: getAlias(), avatar: getAvatar() };
}
