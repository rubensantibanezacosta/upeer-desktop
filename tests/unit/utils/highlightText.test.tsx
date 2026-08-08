import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { highlightText } from '../../../src/utils/highlightText.tsx';

describe('highlightText', () => {
    it('devuelve el texto sin cambios si el highlight está vacío', () => {
        const result = highlightText('hola mundo', '  ');
        expect(result).toBe('hola mundo');
    });

    it('resalta las coincidencias sin importar mayúsculas', () => {
        render(<>{highlightText('Hola mundo, hola de nuevo', 'hola')}</>);
        expect(screen.getByText('Hola')).toBeTruthy();
    });

    it('escapa caracteres especiales del término de búsqueda', () => {
        render(<>{highlightText('precio: 100$', '$')}</>);
        expect(screen.getByText('$')).toBeTruthy();
    });
});
