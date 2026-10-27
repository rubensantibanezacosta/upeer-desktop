import React, { forwardRef, useRef, useCallback, useImperativeHandle, useLayoutEffect, useEffect } from 'react';
import { Box } from '@mui/joy';
import { INPUT_PILL_RADIUS, INPUT_PILL_HEIGHT } from '../../../inputShape.js';

const DIM = 'opacity:0.4';
const URL_STYLE = 'color:var(--joy-palette-primary-plainColor);text-decoration:underline';
const SPLIT_RE = /(\*\*[\s\S]+?\*\*|_[\s\S]+?_|~~[\s\S]+?~~|`[^`]+`|https?:\/\/[^\s<>"']+)/g;

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPlain(text: string): string {
    return text.replace(/https?:\/\/[^\s<>"']+/g, (url) => `<span style="${URL_STYLE}">${esc(url)}</span>`);
}

function mdToHtml(text: string): string {
    return text.split(SPLIT_RE).map(part => {
        if (!part) return '';
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
            return `<span style="${DIM}">**</span><strong>${renderPlain(esc(part.slice(2, -2)))}</strong><span style="${DIM}">**</span>`;
        if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
            return `<span style="${DIM}">_</span><em>${renderPlain(esc(part.slice(1, -1)))}</em><span style="${DIM}">_</span>`;
        if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4)
            return `<span style="${DIM}">~~</span><s>${renderPlain(esc(part.slice(2, -2)))}</s><span style="${DIM}">~~</span>`;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
            return `<span style="${DIM}">\`</span><code style="font-family:monospace;font-size:0.9em;background:var(--joy-palette-background-level2);padding:0 2px;border-radius:2px">${esc(part.slice(1, -1))}</code><span style="${DIM}">\`</span>`;
        if (part.startsWith('http')) return `<span style="${URL_STYLE}">${esc(part)}</span>`;
        return renderPlain(esc(part));
    }).join('');
}

function getOffset(el: HTMLElement): number {
    return caretOffset(el) ?? 0;
}

function caretOffset(el: HTMLElement): number | null {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.endContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
}

function setOffset(el: HTMLElement, offset: number): void {
    const sel = window.getSelection();
    if (!sel) return;
    const s = sel;
    let n = 0;

    function walk(node: Node): boolean {
        if (node.nodeType === Node.TEXT_NODE) {
            const len = node.textContent?.length ?? 0;
            if (n + len >= offset) {
                const r = document.createRange();
                r.setStart(node, offset - n);
                r.collapse(true);
                s.removeAllRanges();
                s.addRange(r);
                return true;
            }
            n += len;
        } else {
            for (const c of node.childNodes) {
                if (walk(c)) return true;
            }
        }
        return false;
    }

    if (!walk(el)) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        s.removeAllRanges();
        s.addRange(r);
    }
}

export interface RichInputHandle {
    insertText: (text: string) => void;
    focus: () => void;
}

interface RichInputProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    autoComplete?: string;
    autoFocus?: boolean;
    focusKey?: string;
    embedded?: boolean;
}

export const RichInput = forwardRef<RichInputHandle, RichInputProps>(function RichInput({ value, onChange, onKeyDown, placeholder, disabled, autoFocus = false, focusKey, embedded = false }, handle) {
    const ref = useRef<HTMLDivElement>(null);
    const composing = useRef(false);
    const fromInput = useRef(false);
    const caret = useRef<number | null>(null);
    const pendingCaret = useRef<number | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (!fromInput.current && (el.textContent ?? '') !== value) {
            el.innerHTML = mdToHtml(value);
        }
        if (pendingCaret.current !== null) {
            setOffset(el, pendingCaret.current);
            pendingCaret.current = null;
        }
    }, [value]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const remember = () => {
            const offset = caretOffset(el);
            if (offset !== null) caret.current = offset;
        };
        document.addEventListener('selectionchange', remember);
        return () => document.removeEventListener('selectionchange', remember);
    }, []);

    useImperativeHandle(handle, () => ({
        insertText: (text: string) => {
            const el = ref.current;
            if (!el || disabled) return;
            const offset = Math.min(caret.current ?? value.length, value.length);
            const next = `${value.slice(0, offset)}${text}${value.slice(offset)}`;
            caret.current = offset + text.length;
            pendingCaret.current = offset + text.length;
            el.focus({ preventScroll: true });
            if (next === value) {
                setOffset(el, offset + text.length);
                pendingCaret.current = null;
                return;
            }
            onChange(next);
        },
        focus: () => {
            const el = ref.current;
            if (!el) return;
            el.focus({ preventScroll: true });
            if (caret.current !== null) setOffset(el, Math.min(caret.current, (el.textContent ?? '').length));
        },
    }), [disabled, onChange, value]);

    useEffect(() => {
        if (!autoFocus || disabled) return;
        const el = ref.current;
        if (!el) return;
        const timer = window.setTimeout(() => {
            el.focus({ preventScroll: true });
            setOffset(el, (el.textContent ?? '').length);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [autoFocus, disabled, focusKey]);

    const handleInput = useCallback(() => {
        const el = ref.current;
        if (!el || composing.current) return;
        const text = el.textContent ?? '';
        const offset = getOffset(el);
        fromInput.current = true;
        onChange(text);
        fromInput.current = false;
        el.innerHTML = mdToHtml(text);
        setOffset(el, offset);
    }, [onChange]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        sel.deleteFromDocument();
        const node = document.createTextNode(text);
        sel.getRangeAt(0).insertNode(node);
        sel.collapseToEnd();
        handleInput();
    }, [handleInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
        onKeyDown?.(e);
    }, [onKeyDown]);

    return (
        <Box
            sx={{
                flexGrow: 1,
                minWidth: 0,
                position: 'relative',
                borderRadius: embedded ? 0 : INPUT_PILL_RADIUS,
                backgroundColor: embedded ? 'transparent' : 'background.level1',
                height: INPUT_PILL_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                px: embedded ? 0.5 : 2,
                cursor: 'text',
                overflow: 'hidden'
            }}
            onClick={() => ref.current?.focus()}
        >
            {!value && (
                <Box component="span" sx={{ position: 'absolute', pointerEvents: 'none', color: 'text.tertiary', fontSize: '0.875rem', userSelect: 'none', left: embedded ? 4 : 16 }}>
                    {placeholder}
                </Box>
            )}
            <Box
                ref={ref}
                contentEditable={!disabled}
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={() => { composing.current = false; handleInput(); }}
                sx={{
                    width: '100%',
                    outline: 'none',
                    whiteSpace: 'nowrap',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    fontSize: '1rem',
                    lineHeight: INPUT_PILL_HEIGHT,
                    color: 'text.primary',
                    '&::-webkit-scrollbar': { display: 'none' },
                    scrollbarWidth: 'none',
                    '& strong': { fontWeight: 700 },
                    '& em': { fontStyle: 'italic' },
                    '& s': { textDecoration: 'line-through' },
                    '& code': { fontFamily: 'monospace' },
                    ...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : {}),
                }}
            />
        </Box>
    );
});
