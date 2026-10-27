import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopHeader } from '../../../src/components/layout/TopHeader.js';

describe('TopHeader actividad del contacto', () => {
    it('muestra que el contacto está escribiendo', () => {
        render(<TopHeader contactName="Ana" activity="typing" />);

        expect(screen.getByText('Escribiendo...')).toBeDefined();
    });

    it('muestra que el contacto está grabando audio', () => {
        render(<TopHeader contactName="Ana" activity="recording" />);

        expect(screen.getByText('Grabando audio...')).toBeDefined();
    });

    it('vuelve al estado de presencia cuando no hay actividad', () => {
        render(<TopHeader contactName="Ana" isOnline />);

        expect(screen.queryByText('Escribiendo...')).toBeNull();
        expect(screen.getByText('En línea')).toBeDefined();
    });
});
