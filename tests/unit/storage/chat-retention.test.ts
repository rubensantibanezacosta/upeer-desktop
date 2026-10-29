import { describe, it, expect, vi, beforeEach } from 'vitest';

const persisted = new Map<string, unknown>();

vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: vi.fn((key: string, fallback: unknown) => (persisted.has(key) ? persisted.get(key) : fallback)),
    setAppSetting: vi.fn((key: string, value: unknown) => { persisted.set(key, value); }),
}));

import { setAppSetting } from '../../../src/main_process/storage/settings-operations.js';
import {
    expiresAtForMessage,
    getChatRetentionId,
    getChatRetentionMs,
    getRetentionMap,
    resetRetentionCache,
    setChatRetention,
} from '../../../src/main_process/storage/retention/chatRetention.js';

describe('chatRetention', () => {
    beforeEach(() => {
        persisted.clear();
        resetRetentionCache();
        vi.clearAllMocks();
    });

    it('sin ajuste guardado no hay temporales', () => {
        expect(getRetentionMap()).toEqual({});
        expect(getChatRetentionId('alice')).toBe('off');
        expect(getChatRetentionMs('alice')).toBe(0);
        expect(expiresAtForMessage('alice', 1_000)).toBeNull();
    });

    it('sanea lo que hay guardado', () => {
        persisted.set('chat-retention', { alice: '24h', bob: 'inventado', carol: 'off' });

        expect(getRetentionMap()).toEqual({ alice: '24h' });
    });

    it('guarda el plazo de un chat y lo refleja en la caché', () => {
        setChatRetention('alice', '7d');

        expect(setAppSetting).toHaveBeenCalledWith('chat-retention', { alice: '7d' });
        expect(getChatRetentionId('alice')).toBe('7d');
        expect(getChatRetentionMs('alice')).toBe(604_800_000);
        expect(expiresAtForMessage('alice', 1_000)).toBe(604_801_000);
    });

    it('volver a desactivados borra la entrada en vez de guardar ceros', () => {
        setChatRetention('alice', '24h');
        setChatRetention('alice', 'off');

        expect(getRetentionMap()).toEqual({});
        expect(setAppSetting).toHaveBeenCalledWith('chat-retention', {});
    });

    it('un valor desconocido desactiva el chat', () => {
        setChatRetention('alice', '24h');
        setChatRetention('alice', 'mañana');

        expect(getChatRetentionId('alice')).toBe('off');
    });

    it('emite el plazo como ajuste compartido y lo anota en el reloj', async () => {
        const { registerSyncEventSink } = await import('../../../src/main_process/storage/sync/eventSink.js');
        const emitted: { kind: string; entityId: string; payload: Record<string, unknown> }[] = [];
        registerSyncEventSink((event) => { emitted.push(event); });

        setChatRetention('alice', '90d');
        registerSyncEventSink(null);

        expect(emitted).toHaveLength(1);
        expect(emitted[0]?.kind).toBe('SETTINGS_UPDATE');
        expect(emitted[0]?.entityId).toBe('retention:alice');
        expect(emitted[0]?.payload).toEqual({ block: 'retention', chatId: 'alice', retention: '90d' });
        expect(persisted.get('settings-sync-clock')).toMatchObject({ 'retention:alice': expect.any(Number) });
    });

    it('no emite nada si el plazo no cambia', async () => {
        const { registerSyncEventSink } = await import('../../../src/main_process/storage/sync/eventSink.js');
        setChatRetention('alice', '7d');
        const emitted: unknown[] = [];
        registerSyncEventSink((event) => { emitted.push(event); });

        setChatRetention('alice', '7d');
        registerSyncEventSink(null);

        expect(emitted).toHaveLength(0);
    });
});
