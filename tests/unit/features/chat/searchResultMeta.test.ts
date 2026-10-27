import { describe, expect, it } from 'vitest';
import { summarizeSearchResult } from '../../../../src/features/chat/searchResultMeta.js';

describe('summarizeSearchResult', () => {
    it('devuelve el texto plano de un mensaje normal', () => {
        expect(summarizeSearchResult('  hola   mundo  ')).toEqual({ kind: 'text', label: 'hola mundo' });
    });

    it('recorta los textos largos con elipsis', () => {
        const summary = summarizeSearchResult('a'.repeat(200));
        expect(summary.kind).toBe('text');
        expect(summary.label).toHaveLength(141);
        expect(summary.label.endsWith('…')).toBe(true);
    });

    it('describe un archivo adjunto con su nombre', () => {
        const raw = JSON.stringify({ type: 'file', fileName: 'informe.pdf', fileSize: 2048 });
        expect(summarizeSearchResult(raw)).toEqual({ kind: 'file', label: 'informe.pdf' });
    });

    it('describe un archivo sin nombre', () => {
        const raw = JSON.stringify({ type: 'file', fileSize: 2048 });
        expect(summarizeSearchResult(raw)).toEqual({ kind: 'file', label: 'Archivo adjunto' });
    });

    it('distingue una nota de voz', () => {
        const raw = JSON.stringify({ type: 'file', fileName: 'audio.m4a', isVoiceNote: true });
        expect(summarizeSearchResult(raw)).toEqual({ kind: 'voice', label: 'Nota de voz · audio.m4a' });
    });

    it('describe una tarjeta de contacto', () => {
        const raw = JSON.stringify({ type: 'contact_card', contact: { name: 'Ana' } });
        expect(summarizeSearchResult(raw)).toEqual({ kind: 'card', label: 'Ana' });
    });

    it('usa el texto de una vista previa de enlace', () => {
        const raw = JSON.stringify({ text: 'mira esto', linkPreview: { url: 'https://a.test' } });
        expect(summarizeSearchResult(raw)).toEqual({ kind: 'text', label: 'mira esto' });
    });

    it('cae en un texto genérico con JSON desconocido o vacío', () => {
        expect(summarizeSearchResult('{"foo":"bar"}')).toEqual({ kind: 'text', label: 'Mensaje' });
        expect(summarizeSearchResult('   ')).toEqual({ kind: 'text', label: 'Mensaje' });
    });
});
