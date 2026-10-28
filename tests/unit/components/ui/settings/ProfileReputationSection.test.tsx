import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProfileReputationSection } from '../../../../../src/components/ui/settings/profileSectionBlocks.js';

const renderSection = (vouchScore: number, connectionCount = 3) => render(
    <ProfileReputationSection
        myReputation={{ vouchScore, connectionCount }}
        onToggleInfo={vi.fn()}
    />,
);

describe('ProfileReputationSection', () => {
    it('no muestra ninguna nota cuando la reputación es normal', () => {
        renderSection(72);

        expect(screen.queryByText(/Reputación baja/)).toBeNull();
        expect(screen.queryByText('72/100')).toBeNull();
        expect(screen.getByText(/3 contactos directos/)).toBeDefined();
    });

    it('avisa cuando la reputación es muy mala', () => {
        renderSection(12);

        expect(screen.getByText(/Reputación baja en la red \(12\/100\)/)).toBeDefined();
        expect(screen.getByText('Baja')).toBeDefined();
    });

    it('no publica la puntuación exacta en la tarjeta', () => {
        const { container } = renderSection(12);

        expect(container.textContent).not.toContain('Vouches');
    });
});
