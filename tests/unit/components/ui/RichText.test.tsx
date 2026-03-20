import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichText } from '../../../../src/components/ui/RichText.js';

const mockOpenExternal = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    window.upeer = { openExternal: mockOpenExternal } as any;
});

describe('RichText', () => {
    it('renderiza texto plano sin elementos adicionales', () => {
        render(<RichText>Hola mundo</RichText>);
        expect(screen.getByText('Hola mundo')).toBeTruthy();
        expect(document.querySelector('a')).toBeNull();
        expect(document.querySelector('code')).toBeNull();
    });

    it('renderiza texto vacío sin errores', () => {
        const { container } = render(<RichText>{''}</RichText>);
        expect(container).toBeTruthy();
    });

    it('renderiza negrita (**texto**) como <span>', () => {
        render(<RichText>{'**negrita**'}</RichText>);
        const span = document.querySelector('span');
        expect(span).toBeTruthy();
        expect(span?.textContent).toBe('negrita');
    });

    it('renderiza cursiva (_texto_) como <span>', () => {
        render(<RichText>{'_cursiva_'}</RichText>);
        const span = document.querySelector('span');
        expect(span).toBeTruthy();
        expect(span?.textContent).toBe('cursiva');
    });

    it('renderiza tachado (~~texto~~) como <span>', () => {
        render(<RichText>{'~~tachado~~'}</RichText>);
        const span = document.querySelector('span');
        expect(span).toBeTruthy();
        expect(span?.textContent).toBe('tachado');
    });

    it('renderiza código (`texto`) como <code>', () => {
        render(<RichText>{'`monospace`'}</RichText>);
        const code = document.querySelector('code');
        expect(code).toBeTruthy();
        expect(code?.textContent).toBe('monospace');
    });

    it('renderiza URL https como <a>', () => {
        render(<RichText>{'Visita https://example.com por favor'}</RichText>);
        const anchor = document.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor?.textContent).toBe('https://example.com');
    });

    it('NO renderiza URLs javascript: como <a>', () => {
        render(<RichText>{'javascript:alert(1)'}</RichText>);
        expect(document.querySelector('a')).toBeNull();
        expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
    });

    it('NO renderiza URLs data: como <a>', () => {
        render(<RichText>{'data:text/html,<b>xss</b>'}</RichText>);
        expect(document.querySelector('a')).toBeNull();
    });

    it('llama a openExternal al hacer click en un link', () => {
        render(<RichText>{'https://example.com'}</RichText>);
        const anchor = document.querySelector('a');
        expect(anchor).toBeTruthy();
        if (anchor) fireEvent.click(anchor);
        expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('no llama a openExternal si window.upeer no existe', () => {
        (window as any).upeer = undefined;
        render(<RichText>{'https://example.com'}</RichText>);
        const anchor = document.querySelector('a');
        if (anchor) expect(() => fireEvent.click(anchor)).not.toThrow();
    });

    it('renderiza contenido mixto (markdown + URL) correctamente', () => {
        render(<RichText>{'**hola** visita https://test.com y _adiós_'}</RichText>);
        const spans = document.querySelectorAll('span');
        const anchor = document.querySelector('a');
        expect(spans.length).toBeGreaterThanOrEqual(2);
        expect(anchor?.textContent).toBe('https://test.com');
    });

    it('renderiza URL dentro de negrita como <a>', () => {
        render(<RichText>{'**https://link.com**'}</RichText>);
        const anchor = document.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor?.textContent).toBe('https://link.com');
    });

    it('acepta props de Typography como level y sx', () => {
        const { container } = render(<RichText level="body-sm">texto</RichText>);
        expect(container.querySelector('p, span')).toBeTruthy();
    });
});
