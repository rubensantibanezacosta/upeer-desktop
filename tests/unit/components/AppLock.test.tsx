import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AppLock } from '../../../src/components/ui/AppLock.js';

vi.mock('@mui/icons-material/LockRounded', () => ({ default: () => null }));

const mockVerifyPin = vi.fn();
const mockDeleteIdentity = vi.fn();
type AppLockUpeer = Pick<Window['upeer'], 'verifyPin' | 'deleteIdentity'>;
type AppLockWindow = Window & { upeer: AppLockUpeer };

beforeEach(() => {
    vi.clearAllMocks();
    (window as AppLockWindow).upeer = {
        verifyPin: mockVerifyPin,
        deleteIdentity: mockDeleteIdentity,
    };
    vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AppLock', () => {
    it('debe llamar a onUnlock cuando el PIN es válido', async () => {
        mockVerifyPin.mockResolvedValue(true);
        const onUnlock = vi.fn();

        render(<AppLock onUnlock={onUnlock} />);

        const inputs = document.querySelectorAll('input[type="password"]');
        fireEvent.change(inputs[0], { target: { value: '1' } });
        fireEvent.change(inputs[1], { target: { value: '2' } });
        fireEvent.change(inputs[2], { target: { value: '3' } });
        fireEvent.change(inputs[3], { target: { value: '4' } });

        await waitFor(() => {
            expect(mockVerifyPin).toHaveBeenCalledWith({ pin: '1234' });
        });

        await waitFor(() => {
            expect(onUnlock).toHaveBeenCalled();
        });
    });

    it('debe manejar onUnlock async correctamente', async () => {
        mockVerifyPin.mockResolvedValue(true);

        let checkAuthCalled = false;
        const unlockOrder: string[] = [];

        const mockCheckAuth = vi.fn(async () => {
            await new Promise(r => setTimeout(r, 10));
            checkAuthCalled = true;
            unlockOrder.push('checkAuth');
        });

        const onUnlock = async () => {
            await mockCheckAuth();
            unlockOrder.push('setIsAppLocked');
        };

        render(<AppLock onUnlock={onUnlock} />);

        const inputs = document.querySelectorAll('input[type="password"]');
        fireEvent.change(inputs[0], { target: { value: '1' } });
        fireEvent.change(inputs[1], { target: { value: '2' } });
        fireEvent.change(inputs[2], { target: { value: '3' } });
        fireEvent.change(inputs[3], { target: { value: '4' } });

        await waitFor(() => {
            expect(checkAuthCalled).toBe(true);
        });

        expect(unlockOrder).toEqual(['checkAuth', 'setIsAppLocked']);
    });

    it('NO debe llamar a onUnlock cuando el PIN es inválido', async () => {
        mockVerifyPin.mockResolvedValue(false);
        const onUnlock = vi.fn();

        render(<AppLock onUnlock={onUnlock} />);

        const inputs = document.querySelectorAll('input[type="password"]');
        fireEvent.change(inputs[0], { target: { value: '9' } });
        fireEvent.change(inputs[1], { target: { value: '9' } });
        fireEvent.change(inputs[2], { target: { value: '9' } });
        fireEvent.change(inputs[3], { target: { value: '9' } });

        await waitFor(() => {
            expect(mockVerifyPin).toHaveBeenCalledWith({ pin: '9999' });
        });

        await waitFor(() => {
            expect(screen.getByText(/PIN incorrecto/i)).toBeInTheDocument();
        });

        expect(onUnlock).not.toHaveBeenCalled();
    });

    it('debe mostrar error si verifyPin lanza excepción', async () => {
        mockVerifyPin.mockRejectedValue(new Error('Network error'));
        const onUnlock = vi.fn();

        render(<AppLock onUnlock={onUnlock} />);

        const inputs = document.querySelectorAll('input[type="password"]');
        fireEvent.change(inputs[0], { target: { value: '1' } });
        fireEvent.change(inputs[1], { target: { value: '2' } });
        fireEvent.change(inputs[2], { target: { value: '3' } });
        fireEvent.change(inputs[3], { target: { value: '4' } });

        await waitFor(() => {
            expect(screen.getByText(/Error al verificar/i)).toBeInTheDocument();
        });

        expect(onUnlock).not.toHaveBeenCalled();
    });

    it('debe borrar la identidad local al iniciar sesión con otra cuenta', async () => {
        render(<AppLock onUnlock={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión con otra cuenta/i }));

        await waitFor(() => {
            expect(window.confirm).toHaveBeenCalled();
            expect(mockDeleteIdentity).toHaveBeenCalledTimes(1);
        });
    });

    it('debe enviar al login tras 10 intentos fallidos de PIN', async () => {
        mockVerifyPin.mockResolvedValue(false);
        const onTooManyAttempts = vi.fn();

        render(<AppLock onUnlock={vi.fn()} onTooManyAttempts={onTooManyAttempts} />);

        for (let attempt = 1; attempt <= 10; attempt += 1) {
            const inputs = document.querySelectorAll('input[type="password"]');
            fireEvent.change(inputs[0], { target: { value: '9' } });
            fireEvent.change(inputs[1], { target: { value: '9' } });
            fireEvent.change(inputs[2], { target: { value: '9' } });
            fireEvent.change(inputs[3], { target: { value: '9' } });

            await waitFor(() => {
                expect(mockVerifyPin).toHaveBeenCalledTimes(attempt);
            });
        }

        await waitFor(() => {
            expect(onTooManyAttempts).toHaveBeenCalledTimes(1);
        });
    });

    it('debe mostrar una alerta cuando queden 5 intentos o menos', async () => {
        mockVerifyPin.mockResolvedValue(false);

        render(<AppLock onUnlock={vi.fn()} />);

        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const inputs = document.querySelectorAll('input[type="password"]');
            fireEvent.change(inputs[0], { target: { value: '9' } });
            fireEvent.change(inputs[1], { target: { value: '9' } });
            fireEvent.change(inputs[2], { target: { value: '9' } });
            fireEvent.change(inputs[3], { target: { value: '9' } });

            await waitFor(() => {
                expect(mockVerifyPin).toHaveBeenCalledTimes(attempt);
            });
        }

        expect(screen.getByText(/Intentos restantes: 5/i)).toBeInTheDocument();
        expect(screen.getByText(/Atención: te quedan 5 intentos o menos antes de volver al login/i)).toBeInTheDocument();
    });
});
