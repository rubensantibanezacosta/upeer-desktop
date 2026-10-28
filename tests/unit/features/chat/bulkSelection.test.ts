import { describe, it, expect } from 'vitest';
import {
    deletableIds,
    describeSelection,
    forwardableMessages,
    orderedSelection,
    summarizeSelection,
    toggleSelected,
} from '../../../../src/features/chat/selection/bulkSelection.js';

type Msg = { id?: string; isMine: boolean; isDeleted?: boolean; message: string };

const messages: Msg[] = [
    { id: 'm1', isMine: true, message: 'hola' },
    { id: 'm2', isMine: false, message: 'qué tal' },
    { id: 'm3', isMine: true, message: 'bien' },
    { id: 'm4', isMine: true, isDeleted: true, message: 'Mensaje eliminado' },
    { isMine: true, message: 'sin id' },
];

describe('toggleSelected', () => {
    it('añade y quita sin mutar el conjunto original', () => {
        const base = new Set<string>(['m1']);
        const added = toggleSelected(base, 'm2');
        expect([...added].sort()).toEqual(['m1', 'm2']);
        expect([...base]).toEqual(['m1']);

        const removed = toggleSelected(added, 'm1');
        expect([...removed]).toEqual(['m2']);
        expect([...added].sort()).toEqual(['m1', 'm2']);
    });
});

describe('describeSelection', () => {
    it('concuerda en singular y plural', () => {
        expect(describeSelection(0)).toBe('0 seleccionados');
        expect(describeSelection(1)).toBe('1 seleccionado');
        expect(describeSelection(4)).toBe('4 seleccionados');
    });
});

describe('orderedSelection', () => {
    it('respeta el orden de la conversación e ignora mensajes sin id', () => {
        const ordered = orderedSelection(messages, new Set(['m3', 'm1']));
        expect(ordered.map((m) => m.id)).toEqual(['m1', 'm3']);
    });
});

describe('summarizeSelection', () => {
    it('separa propios de ajenos y descuenta los eliminados', () => {
        const summary = summarizeSelection(messages, new Set(['m1', 'm2', 'm4']), {});
        expect(summary).toEqual({
            total: 3,
            mine: 1,
            others: 1,
            allStarred: false,
            allPinned: false,
        });
    });

    it('marca todo destacado solo si todos lo están', () => {
        const prefs = { m1: { starred: true }, m2: { starred: true } };
        expect(summarizeSelection(messages, new Set(['m1', 'm2']), prefs).allStarred).toBe(true);
        expect(summarizeSelection(messages, new Set(['m1', 'm2', 'm3']), prefs).allStarred).toBe(false);
    });

    it('con la selección vacía nada está destacado', () => {
        const summary = summarizeSelection(messages, new Set(), {});
        expect(summary.total).toBe(0);
        expect(summary.allStarred).toBe(false);
        expect(summary.allPinned).toBe(false);
    });
});

describe('deletableIds', () => {
    it('solo devuelve propios, vivos y con id', () => {
        expect(deletableIds(messages, new Set(['m1', 'm2', 'm3', 'm4']))).toEqual(['m1', 'm3']);
    });
});

describe('forwardableMessages', () => {
    it('excluye los eliminados y los que no tienen id', () => {
        const forwardable = forwardableMessages(messages, new Set(['m1', 'm2', 'm4']));
        expect(forwardable.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('ordena por fecha aunque la lista venga al revés', () => {
        const reversed: Array<Msg & { date: number }> = [
            { id: 'c', isMine: true, message: 'tercero', date: 300 },
            { id: 'b', isMine: false, message: 'segundo', date: 200 },
            { id: 'a', isMine: true, message: 'primero', date: 100 },
        ];
        const forwardable = forwardableMessages(reversed, new Set(['c', 'a', 'b']));
        expect(forwardable.map((m) => m.message)).toEqual(['primero', 'segundo', 'tercero']);
    });
});
