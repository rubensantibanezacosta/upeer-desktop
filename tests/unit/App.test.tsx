import App, { shouldReloadHistoryForIncomingTransfer } from '../../src/App.js';
import { describe, it, expect, vi } from 'vitest';

// Mock minimal de upeer para evitar errores de compilación/ejecución
vi.stubGlobal('upeer', {
    isPinEnabled: vi.fn().mockResolvedValue(false),
    getMyNetworkAddress: vi.fn().mockResolvedValue('ygg:123'),
    onYggstackAddress: vi.fn(),
    onYggstackStatus: vi.fn(),
});

describe('App Smoke Test', () => {
    it('debe renderizar sin errores de sintaxis', () => {
        expect(App).toBeDefined();
    });

    it('recarga historial para adjuntos directos del chat activo aunque lleguen con chatUpeerId', () => {
        expect(shouldReloadHistoryForIncomingTransfer(
            { direction: 'receiving', upeerId: 'peer-1', chatUpeerId: 'peer-1' },
            '',
            'peer-1'
        )).toBe(true);
    });

    it('no recarga historial para transferencias de otra conversacion', () => {
        expect(shouldReloadHistoryForIncomingTransfer(
            { direction: 'receiving', upeerId: 'peer-2', chatUpeerId: 'peer-2' },
            '',
            'peer-1'
        )).toBe(false);
    });
});
