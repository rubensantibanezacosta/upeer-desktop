import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyChat } from '../../../../src/features/chat/EmptyChat.js';

describe('EmptyChat', () => {
    it('no anuncia que no hay mensajes mientras llega el histórico', () => {
        render(<EmptyChat loading />);
        expect(screen.getByLabelText('Cargando mensajes…')).toBeTruthy();
        expect(screen.queryByText('Aún no hay mensajes aquí. Envía el primero para comenzar esta conversación cifrada de extremo a extremo.')).toBeNull();
    });

    it('anuncia el vacío cuando la carga ha terminado', () => {
        render(<EmptyChat />);
        expect(screen.getByText('Conversación Segura Activada')).toBeTruthy();
    });
});
