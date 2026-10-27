import React, { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { RichInput, type RichInputHandle } from '../../../../../src/features/chat/input/RichInput';

const renderInput = (value: string) => {
    const onChange = vi.fn();
    const ref = createRef<RichInputHandle>();
    const view = render(<RichInput ref={ref} value={value} onChange={onChange} />);
    const editor = view.container.querySelector('[contenteditable]') as HTMLElement;
    return { onChange, ref, editor, view };
};

const placeCaret = (editor: HTMLElement, offset: number) => {
    const range = document.createRange();
    range.setStart(editor.firstChild ?? editor, offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
};

describe('RichInput', () => {
    beforeEach(() => {
        window.getSelection()?.removeAllRanges();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('inserta en el cursor, no al final', () => {
        const { onChange, ref, editor } = renderInput('hola mundo');
        placeCaret(editor, 5);

        act(() => ref.current?.insertText('😀'));

        expect(onChange).toHaveBeenCalledWith('hola 😀mundo');
    });

    it('añade al final cuando aún no hay cursor en el campo', () => {
        const { onChange, ref } = renderInput('hola');

        act(() => ref.current?.insertText('😀'));

        expect(onChange).toHaveBeenCalledWith('hola😀');
    });

    it('mantiene el foco al insertar aunque el campo estuviera desenfocado', () => {
        const { onChange, ref, editor } = renderInput('hola mundo');
        placeCaret(editor, 5);
        editor.blur();

        act(() => ref.current?.insertText('😀'));

        expect(document.activeElement).toBe(editor);
        expect(onChange).toHaveBeenCalledWith('hola 😀mundo');
    });

    it('pinta el valor nuevo y deja el cursor detrás del emoji', () => {
        const ref = createRef<RichInputHandle>();
        const Controlled = () => {
            const [value, setValue] = React.useState('hola mundo');
            return <RichInput ref={ref} value={value} onChange={setValue} />;
        };
        const { container } = render(<Controlled />);
        const editor = container.querySelector('[contenteditable]') as HTMLElement;
        placeCaret(editor, 5);

        act(() => ref.current?.insertText('😀'));

        expect(editor.textContent).toBe('hola 😀mundo');
        expect(window.getSelection()?.getRangeAt(0).endOffset).toBe(7);
    });

    it('recuerda la posición del cursor al abrir el selector y volver a enfocar', () => {
        const { ref, editor } = renderInput('hola mundo');
        placeCaret(editor, 7);
        editor.blur();

        act(() => ref.current?.focus());

        expect(document.activeElement).toBe(editor);
        expect(window.getSelection()?.getRangeAt(0).endOffset).toBe(7);
    });

    it('no inserta nada si el campo está deshabilitado', () => {
        const onChange = vi.fn();
        const ref = createRef<RichInputHandle>();
        render(<RichInput ref={ref} value="hola" onChange={onChange} disabled />);

        act(() => ref.current?.insertText('😀'));

        expect(onChange).not.toHaveBeenCalled();
    });
});
