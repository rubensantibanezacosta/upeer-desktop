import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatSystemMessage, parseCallSystemEvent } from '../../../../src/features/chat/chatAreaSupport.js';

vi.mock('@mui/icons-material/Call', () => ({ default: () => <span data-testid="audio-call-icon" /> }));
vi.mock('@mui/icons-material/Videocam', () => ({ default: () => <span data-testid="video-call-icon" /> }));

describe('ChatSystemMessage', () => {
    it('maqueta eventos de llamada de voz con su duración', () => {
        render(<ChatSystemMessage message="Llamada de voz · 03:25" />);

        expect(screen.getByRole('note', { name: 'Llamada de voz, Duración 03:25' })).toBeDefined();
        expect(screen.getByTestId('audio-call-icon')).toBeDefined();
        expect(screen.getByText('Duración 03:25')).toBeDefined();
    });

    it('maqueta eventos de videollamada con su icono', () => {
        render(<ChatSystemMessage message="Videollamada · 00:42" />);

        expect(screen.getByRole('note', { name: 'Videollamada, Duración 00:42' })).toBeDefined();
        expect(screen.getByTestId('video-call-icon')).toBeDefined();
    });

    it('maqueta llamadas fallidas como perdidas sin duración', () => {
        render(<ChatSystemMessage message="Llamada de voz perdida" />);

        expect(screen.getByRole('note', { name: 'Llamada de voz, Llamada perdida' })).toBeDefined();
        expect(screen.getByText('Llamada perdida')).toBeDefined();
    });

    it('mantiene como texto los demás mensajes de sistema', () => {
        render(<ChatSystemMessage message="Ana se unió al grupo" />);

        expect(screen.getByText('Ana se unió al grupo')).toBeDefined();
        expect(screen.queryByRole('note')).toBeNull();
    });

    it('parsea solo los formatos de evento de llamada admitidos', () => {
        expect(parseCallSystemEvent('Videollamada · 01:30')).toEqual({ kind: 'video', duration: '01:30' });
        expect(parseCallSystemEvent('Llamada de voz perdida')).toEqual({ kind: 'audio', duration: null });
        expect(parseCallSystemEvent('mensaje normal')).toBeNull();
    });
});