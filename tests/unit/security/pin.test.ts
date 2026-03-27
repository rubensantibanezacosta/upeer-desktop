import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setAccessPin, verifyAccessPin, disableAccessPin, isPinEnabled } from '../../../src/main_process/security/pin.js';
import * as settingsOps from '../../../src/main_process/storage/settings-operations.js';

vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: vi.fn(),
    setAppSetting: vi.fn(),
}));

describe('PIN Security System', () => {
    const mockStore: Record<string, unknown> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(mockStore).forEach(key => delete mockStore[key]);

        vi.mocked(settingsOps.setAppSetting).mockImplementation((key: string, value: unknown) => {
            mockStore[key] = value;
        });
        vi.mocked(settingsOps.getAppSetting).mockImplementation((key: string, defaultValue: unknown) => {
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
        const invalidPin = { pin: '1234' };
        expect(() => disableAccessPin(invalidPin)).toThrow('PIN must be a string');
    });
});
