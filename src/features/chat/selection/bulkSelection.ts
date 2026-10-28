export type SelectionSummary = {
    total: number;
    mine: number;
    others: number;
    allStarred: boolean;
    allPinned: boolean;
};

export type SelectableMessage = {
    id?: string;
    isMine: boolean;
    isDeleted?: boolean;
};

export type MessagePrefs = { starred?: boolean; pinned?: boolean } | undefined;

export const toggleSelected = (current: ReadonlySet<string>, id: string): Set<string> => {
    const next = new Set(current);
    if (next.has(id)) {
        next.delete(id);
    } else {
        next.add(id);
    }
    return next;
};

export const describeSelection = (total: number): string =>
    total === 1 ? '1 seleccionado' : `${total} seleccionados`;

export const orderedSelection = <T extends SelectableMessage>(
    messages: readonly T[],
    selected: ReadonlySet<string>,
): T[] => messages.filter((message) => !!message.id && selected.has(message.id));

export const summarizeSelection = (
    messages: readonly SelectableMessage[],
    selected: ReadonlySet<string>,
    prefs: Record<string, MessagePrefs>,
): SelectionSummary => {
    const chosen = orderedSelection(messages, selected);
    const total = chosen.length;
    const alive = chosen.filter((message) => !message.isDeleted);
    const mine = alive.filter((message) => message.isMine).length;

    return {
        total,
        mine,
        others: alive.length - mine,
        allStarred: total > 0 && chosen.every((message) => !!message.id && prefs[message.id]?.starred === true),
        allPinned: total > 0 && chosen.every((message) => !!message.id && prefs[message.id]?.pinned === true),
    };
};

export const deletableIds = (messages: readonly SelectableMessage[], selected: ReadonlySet<string>): string[] =>
    orderedSelection(messages, selected)
        .filter((message) => message.isMine && !message.isDeleted && !!message.id)
        .map((message) => message.id as string);

export const chronologicalSelection = <T extends SelectableMessage & { date?: number }>(
    messages: readonly T[],
    selected: ReadonlySet<string>,
): T[] => orderedSelection(messages, selected)
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
        const leftDate = typeof left.message.date === 'number' ? left.message.date : Number.MAX_SAFE_INTEGER;
        const rightDate = typeof right.message.date === 'number' ? right.message.date : Number.MAX_SAFE_INTEGER;
        return leftDate === rightDate ? left.index - right.index : leftDate - rightDate;
    })
    .map((entry) => entry.message);

export const forwardableMessages = <T extends SelectableMessage & { message: string; date?: number }>(
    messages: readonly T[],
    selected: ReadonlySet<string>,
): T[] => chronologicalSelection(messages, selected).filter((message) => !message.isDeleted);
