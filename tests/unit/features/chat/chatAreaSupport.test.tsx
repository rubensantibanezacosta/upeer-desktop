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
        const startedAt = new Date(2026, 9, 16, 9, 30).getTime();
        render(<ChatSystemMessage message={`Videollamada · 00:42 · ${startedAt}`} />);

        const startTime = new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        expect(screen.getByRole('note', { name: `Videollamada, iniciada a las ${startTime}, Duración 00:42` })).toBeDefined();
        expect(screen.getByTestId('video-call-icon')).toBeDefined();
        expect(screen.getByText(`Inicio ${startTime}`)).toBeDefined();
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
        expect(parseCallSystemEvent('Videollamada · 01:30')).toEqual({ kind: 'video', duration: '01:30', startedAt: null });
        expect(parseCallSystemEvent('Videollamada · 01:30 · 1792065600000')).toEqual({ kind: 'video', duration: '01:30', startedAt: 1792065600000 });
        expect(parseCallSystemEvent('Llamada de voz perdida')).toEqual({ kind: 'audio', duration: null, startedAt: null });
        expect(parseCallSystemEvent('mensaje normal')).toBeNull();
    });
});