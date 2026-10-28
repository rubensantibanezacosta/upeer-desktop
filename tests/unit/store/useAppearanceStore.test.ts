import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'appearance-settings';

const loadStore = async () => {
    vi.resetModules();
    const module = await import('../../../src/store/useAppearanceStore.js');
    return module.useAppearanceStore;
};

describe('useAppearanceStore', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('arranca con los valores por defecto cuando no hay preferencias guardadas', async () => {
        const store = await loadStore();

        expect(store.getState().theme).toBe('dark');
        expect(store.getState().fontSize).toBe('medium');
    });

    it('conserva tema y tamaño de texto de una preferencia guardada', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            state: { theme: 'light', fontSize: 'large' },
            version: 0,
        }));

        const store = await loadStore();

        expect(store.getState().theme).toBe('light');
        expect(store.getState().fontSize).toBe('large');
    });

    it('descarta claves de versiones anteriores sin perder tema ni tamaño de texto', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            state: { theme: 'light', fontSize: 'small', glassOpacity: 70, glassCanvas: true },
            version: 1,
        }));

        const store = await loadStore();

        expect(store.getState().theme).toBe('light');
        expect(store.getState().fontSize).toBe('small');
        expect(store.getState()).not.toHaveProperty('glassOpacity');
        expect(store.getState()).not.toHaveProperty('glassCanvas');
    });

    it('actualiza el tema y el tamaño de texto', async () => {
        const store = await loadStore();

        store.getState().setTheme('light');
        store.getState().setFontSize('large');

        expect(store.getState().theme).toBe('light');
        expect(store.getState().fontSize).toBe('large');
    });
});
