import App from '../../src/App.js';
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
        // Solo verificamos que el componente se pueda importar y procesar por Vite/Vitest
        // Esto previene fallos como el "Unexpected reserved word 'await'"
        expect(App).toBeDefined();
    });
});
