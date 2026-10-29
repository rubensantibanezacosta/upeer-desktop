import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ReputationSection } from '../../../../../src/components/ui/settings/ReputationSection.js';

const renderSection = (vouchScore: number, connectionCount = 3) => render(
    <ReputationSection
        myReputation={{ vouchScore, connectionCount }}
        onToggleInfo={vi.fn()}
    />,
);

describe('ReputationSection', () => {
    it('muestra la puntuación aunque sea normal', () => {
        renderSection(72);

        expect(screen.getByText('72')).toBeDefined();
        expect(screen.getByText('de 100')).toBeDefined();
        expect(screen.queryByText(/Reputación baja/)).toBeNull();
        expect(screen.getByText(/3 contactos directos/)).toBeDefined();
    });

    it('avisa cuando la reputación es muy mala y sigue dando la medida', () => {
        renderSection(12);

        expect(screen.getByText(/Reputación baja en la red \(12\/100\)/)).toBeDefined();
        expect(screen.getByText('Baja')).toBeDefined();
        expect(screen.getByText('12')).toBeDefined();
    });

    it('redondea la puntuación al entero más cercano', () => {
        renderSection(41.6);

        expect(screen.getByText('42')).toBeDefined();
    });

    it('no usa jerga interna en la tarjeta', () => {
        const { container } = renderSection(12);

        expect(container.textContent).not.toContain('Vouches');
    });
});
