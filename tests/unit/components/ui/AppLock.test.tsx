import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppLock } from '../../../../src/components/ui/AppLock';

const mockVerifyPin = vi.fn();
const mockDeleteIdentity = vi.fn();
const mockIsPinEnabled = vi.fn();
type AppLockUpeer = Pick<Window['upeer'], 'verifyPin' | 'isPinEnabled' | 'deleteIdentity'>;
type AppLockWindow = Window & { upeer: AppLockUpeer };

(window as AppLockWindow).upeer = {
    verifyPin: mockVerifyPin,
    isPinEnabled: mockIsPinEnabled,
    deleteIdentity: mockDeleteIdentity
};

describe('AppLock Component (UI-to-Backend Integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should handle segmented PIN input and auto-submit', async () => {
        const onUnlock = vi.fn();
        mockVerifyPin.mockResolvedValue(true);

        render(<AppLock onUnlock={onUnlock} />);

        const passwordInputs = document.querySelectorAll('input[type="password"]');
        expect(passwordInputs).toHaveLength(4);

        fireEvent.change(passwordInputs[0], { target: { value: '1' } });
        fireEvent.change(passwordInputs[1], { target: { value: '2' } });
        fireEvent.change(passwordInputs[2], { target: { value: '3' } });

        fireEvent.change(passwordInputs[3], { target: { value: '4' } });

        await waitFor(() => {
            expect(mockVerifyPin).toHaveBeenCalledWith({ pin: '1234' });
            expect(onUnlock).toHaveBeenCalled();
        });
    });

    it('should show error message on invalid PIN', async () => {
        mockVerifyPin.mockResolvedValue(false);
        const onUnlock = vi.fn();
        render(<AppLock onUnlock={onUnlock} />);

        const passwordInputs = document.querySelectorAll('input[type="password"]');

        fireEvent.change(passwordInputs[0], { target: { value: '0' } });
        fireEvent.change(passwordInputs[1], { target: { value: '0' } });
        fireEvent.change(passwordInputs[2], { target: { value: '0' } });
        fireEvent.change(passwordInputs[3], { target: { value: '0' } });

        await waitFor(() => {
            expect(mockVerifyPin).toHaveBeenCalledWith({ pin: '0000' });
            expect(screen.getByText(/PIN incorrecto/i)).toBeDefined();
        });

        expect((passwordInputs[0] as HTMLInputElement).value).toBe('');
    });

    it('should handle backspace navigation between inputs', () => {
        render(<AppLock onUnlock={vi.fn()} />);
        const passwordInputs = document.querySelectorAll('input[type="password"]');

        const input2 = passwordInputs[1] as HTMLInputElement;
        const input1 = passwordInputs[0] as HTMLInputElement;

        input2.focus();
        expect(document.activeElement).toBe(input2);

        fireEvent.keyDown(input2, { key: 'Backspace' });

        expect(document.activeElement).toBe(input1);
    });

    it('should delete local identity when choosing another account', async () => {
        render(<AppLock onUnlock={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión con otra cuenta/i }));

        await waitFor(() => {
            expect(window.confirm).toHaveBeenCalled();
            expect(mockDeleteIdentity).toHaveBeenCalledTimes(1);
        });
    });

    it('should redirect to login after 10 invalid PIN attempts', async () => {
        mockVerifyPin.mockResolvedValue(false);
        const onTooManyAttempts = vi.fn();

        render(<AppLock onUnlock={vi.fn()} onTooManyAttempts={onTooManyAttempts} />);

        for (let attempt = 1; attempt <= 10; attempt += 1) {
            const passwordInputs = document.querySelectorAll('input[type="password"]');
            fireEvent.change(passwordInputs[0], { target: { value: '0' } });
            fireEvent.change(passwordInputs[1], { target: { value: '0' } });
            fireEvent.change(passwordInputs[2], { target: { value: '0' } });
            fireEvent.change(passwordInputs[3], { target: { value: '0' } });

            await waitFor(() => {
                expect(mockVerifyPin).toHaveBeenCalledTimes(attempt);
            });
        }

        await waitFor(() => {
            expect(onTooManyAttempts).toHaveBeenCalledTimes(1);
        });
    });

    it('should warn when 5 or fewer PIN attempts remain', async () => {
        mockVerifyPin.mockResolvedValue(false);

        render(<AppLock onUnlock={vi.fn()} />);

        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const passwordInputs = document.querySelectorAll('input[type="password"]');
            fireEvent.change(passwordInputs[0], { target: { value: '0' } });
            fireEvent.change(passwordInputs[1], { target: { value: '0' } });
            fireEvent.change(passwordInputs[2], { target: { value: '0' } });
            fireEvent.change(passwordInputs[3], { target: { value: '0' } });

            await waitFor(() => {
                expect(mockVerifyPin).toHaveBeenCalledTimes(attempt);
            });
        }

        expect(screen.getByText(/Intentos restantes: 5/i)).toBeDefined();
        expect(screen.getByText(/Atención: te quedan 5 intentos o menos antes de volver al login/i)).toBeDefined();
    });
});
