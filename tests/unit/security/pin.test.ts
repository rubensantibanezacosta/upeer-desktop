import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setAccessPin, verifyAccessPin, disableAccessPin, isPinEnabled } from '../../../src/main_process/security/pin.js';
import * as settingsOps from '../../../src/main_process/storage/settings-operations.js';

// Mock de las operaciones de settings para evitar tocar la DB real
vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: vi.fn(),
    setAppSetting: vi.fn(),
}));

describe('PIN Security System', () => {
    const mockStore: Record<string, any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        // Limpiar el almacén simulado
        Object.keys(mockStore).forEach(key => delete mockStore[key]);

        // Simular comportamiento de settings
        (settingsOps.setAppSetting as any).mockImplementation((key: string, value: any) => {
            mockStore[key] = value;
        });
        (settingsOps.getAppSetting as any).mockImplementation((key: string, defaultValue: any) => {
            return mockStore[key] !== undefined ? mockStore[key] : defaultValue;
        });
    });

    it('should be disabled by default', () => {
        expect(isPinEnabled()).toBe(false);
    });

    it('should set and verify a correct PIN', () => {
        const myPin = '1234';
        setAccessPin(myPin);

        expect(isPinEnabled()).toBe(true);
        expect(verifyAccessPin(myPin)).toBe(true);
    });

    it('should fail verification with wrong PIN', () => {
        setAccessPin('1234');
        expect(verifyAccessPin('4321')).toBe(false);
    });

    it('should disable PIN with correct current PIN', () => {
        const myPin = '1111';
        setAccessPin(myPin);
        expect(isPinEnabled()).toBe(true);

        disableAccessPin(myPin);
        expect(isPinEnabled()).toBe(false);
    });

    it('should throw error when disabling with wrong PIN', () => {
        setAccessPin('1111');
        expect(() => disableAccessPin('2222')).toThrow('Invalid current PIN');
        expect(isPinEnabled()).toBe(true);
    });

    it('should handle non-string values gracefully (regression test)', () => {
        const invalidPin: any = { pin: '1234' };
        expect(() => disableAccessPin(invalidPin)).toThrow('PIN must be a string');
    });
});
