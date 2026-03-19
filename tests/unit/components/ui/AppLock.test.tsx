import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppLock } from '../../../../src/components/ui/AppLock';

// Mock de la API de uPeer expuesta en el objeto window
const mockVerifyPin = vi.fn();
const mockIsPinEnabled = vi.fn();
(window as any).upeer = {
    verifyPin: mockVerifyPin,
    isPinEnabled: mockIsPinEnabled
};

describe('AppLock Component (UI-to-Backend Integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle segmented PIN input and auto-submit', async () => {
        const onUnlock = vi.fn();
        mockVerifyPin.mockResolvedValue(true);

        render(<AppLock onUnlock={onUnlock} />);

        // MUI Joy renderiza inputs reales pero podemos seleccionarlos directamente
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        expect(passwordInputs).toHaveLength(4);

        // Simular escritura en los 4 campos
        fireEvent.change(passwordInputs[0], { target: { value: '1' } });
        fireEvent.change(passwordInputs[1], { target: { value: '2' } });
        fireEvent.change(passwordInputs[2], { target: { value: '3' } });

        // El último dígito dispara el handleUnlock
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
});
