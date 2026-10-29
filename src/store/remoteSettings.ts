import { hydrateNotificationPrefs } from './notificationSync.js';
import { hydratePrivacyPrefs } from './privacySync.js';
import { useChatActionsStore } from './useChatActionsStore.js';
import { useChatListsStore } from './useChatListsStore.js';
import { useChatRetentionStore } from './chatRetentionStore.js';
import { useChatStore } from './useChatStore.js';
import type { MyIdentity } from '../types/chat.js';

export type RemoteSettingsPatch = {
    block: string;
    entity?: string;
    values: Record<string, unknown>;
    occurredAt?: number;
};

export function applyRemoteSettingsPatch(patch: RemoteSettingsPatch): void {
    const values = patch.values ?? {};
    if (patch.block === 'privacy') {
        hydratePrivacyPrefs().catch((cause: unknown) => {
            console.warn('No se pudieron releer las preferencias de privacidad sincronizadas.', cause);
        });
        return;
    }
    if (patch.block === 'retention') {
        void useChatRetentionStore.getState().hydrate();
        return;
    }
    if (patch.block === 'chat') {
        const chatId = typeof values.chatId === 'string' ? values.chatId : '';
        if (chatId) useChatActionsStore.getState().applyRemoteChat(chatId, values);
        return;
    }
    if (patch.block === 'message') {
        useChatActionsStore.getState().applyRemoteMessage(values);
        return;
    }
    if (patch.block === 'lists') {
        useChatListsStore.getState().applyRemoteList(values);
        return;
    }
    if (patch.block === 'profile') {
        void refreshMyIdentity();
        return;
    }
    hydrateNotificationPrefs().catch((cause: unknown) => {
        console.warn('No se pudieron releer las preferencias de notificación sincronizadas.', cause);
    });
}

async function refreshMyIdentity(): Promise<void> {
    const read = typeof window !== 'undefined' ? window.upeer?.getMyIdentity : undefined;
    if (typeof read !== 'function') return;
    const identity = (await read().catch((cause: unknown) => {
        console.warn('No se pudo releer la identidad sincronizada.', cause);
        return null;
    })) as MyIdentity | null;
    if (identity) useChatStore.getState().setMyIdentity(identity);
}

export function isRendererOwnedBlock(block: string): boolean {
    return block === 'chat' || block === 'message' || block === 'lists';
}

export function handleSettingsUpdated(patch: RemoteSettingsPatch): void {
    if (!isRendererOwnedBlock(patch.block)) {
        applyRemoteSettingsPatch(patch);
        return;
    }
    drainPendingSettingsPatches().catch((cause: unknown) => {
        console.warn('No se pudieron adoptar los ajustes sincronizados pendientes.', cause);
    });
}

export async function drainPendingSettingsPatches(): Promise<void> {
    const bridge = typeof window !== 'undefined' ? window.upeer : undefined;
    const read = bridge?.getPendingSettingsPatches;
    if (typeof read !== 'function') return;
    const result = await read().catch((cause: unknown) => {
        console.warn('No se pudieron leer los ajustes sincronizados pendientes.', cause);
        return null;
    });
    if (!result?.patches?.length) return;
    const ack = bridge?.ackSettingsPatch;
    for (const patch of result.patches) {
        applyRemoteSettingsPatch(patch);
        if (typeof ack !== 'function' || !patch.entity) continue;
        await ack(patch.entity, patch.occurredAt).catch((cause: unknown) => {
            console.warn('No se pudo confirmar un ajuste sincronizado.', cause);
        });
    }
}
