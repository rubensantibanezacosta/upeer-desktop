import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LocationStatusCard } from '../../../src/components/ui/settings/LocationStatusCard.js';
import type { LocationStatus } from '../../../src/components/ui/settings/locationStatusSupport.js';

const NOW = 1_700_000_000_000;

const buildStatus = (overrides: Partial<LocationStatus> = {}): LocationStatus => ({
    publishedAt: NOW - 90_000,
    lastSeq: 12,
    expiresAt: NOW + 20 * 24 * 60 * 60 * 1000,
    nextRenewalAt: NOW + 17 * 24 * 60 * 60 * 1000,
    storeTargets: 8,
    storeAcks: 5,
    lastDhtUpdateAt: NOW - 5_000,
    errors: { certificate: null, admission: null, network: null },
    ...overrides,
});

const mockGetLocationStatus = vi.fn();

describe('LocationStatusCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(NOW);
        Object.assign(window, {
            upeer: { ...(window as unknown as { upeer?: object }).upeer, getLocationStatus: mockGetLocationStatus },
        });
    });

    it('muestra el resumen de publicación y copias', async () => {
        mockGetLocationStatus.mockResolvedValue(buildStatus());
        render(<LocationStatusCard />);

        await waitFor(() => expect(screen.getByText('Publicada')).toBeDefined());
        expect(screen.getByText(/secuencia 12/)).toBeDefined();
        expect(screen.getByText('5 de 8 nodos confirmaron la copia.')).toBeDefined();
        expect(screen.getByText('hace unos segundos')).toBeDefined();
    });

    it('marca pendiente mientras no hay acuses', async () => {
        mockGetLocationStatus.mockResolvedValue(buildStatus({ storeAcks: 0, storeTargets: 0, publishedAt: null, lastSeq: null }));
        render(<LocationStatusCard />);

        await waitFor(() => expect(screen.getByText('Pendiente')).toBeDefined());
        expect(screen.getByText('Todavía no se ha publicado tu ubicación.')).toBeDefined();
        expect(screen.getByText('Sin nodos contactados todavía.')).toBeDefined();
    });

    it('lista los errores activos por categoría', async () => {
        mockGetLocationStatus.mockResolvedValue(buildStatus({
            errors: {
                certificate: null,
                admission: { at: NOW - 60_000, message: 'contacto sin registro' },
                network: { at: NOW - 10_000, message: 'store timeout' },
            },
        }));
        render(<LocationStatusCard />);

        await waitFor(() => expect(screen.getByText('Admisión')).toBeDefined());
        expect(screen.getByText('Red')).toBeDefined();
        expect(screen.getByText(/contacto sin registro/)).toBeDefined();
        expect(screen.getByText(/store timeout/)).toBeDefined();
    });

    it('no se renderiza si el IPC no está disponible', async () => {
        delete (window as unknown as { upeer?: { getLocationStatus?: unknown } }).upeer?.getLocationStatus;
        const { container } = render(<LocationStatusCard />);

        await waitFor(() => expect(container.firstChild).toBeNull());
    });
});
