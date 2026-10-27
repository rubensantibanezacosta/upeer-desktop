export interface DayGroup<T> {
    key: string;
    label: string;
    rows: T[];
}

export interface HighlightPart {
    text: string;
    match: boolean;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const fold = (value: string): string =>
    value.split('').map((char) => char.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || char).join('');export const dayKeyOf = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const dayLabelOf = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const groupByDay = <T extends { timestamp: number }>(rows: T[]): DayGroup<T>[] => {
    const groups: DayGroup<T>[] = [];
    rows.forEach((row) => {
        const key = Number.isFinite(row.timestamp) ? dayKeyOf(row.timestamp) : 'sin-fecha';
        const current = groups[groups.length - 1];
        if (current && current.key === key) {
            current.rows.push(row);
            return;
        }
        groups.push({ key, label: key === 'sin-fecha' ? 'Sin fecha' : dayLabelOf(row.timestamp), rows: [row] });
    });
    return groups;
};

export const highlightParts = (text: string, query: string): HighlightPart[] => {
    const needle = query.trim();
    if (!needle) {
        return [{ text, match: false }];
    }

    const haystack = fold(text).toLowerCase();
    const target = fold(needle).toLowerCase();
    const parts: HighlightPart[] = [];
    let cursor = 0;

    while (cursor < text.length) {
        const found = haystack.indexOf(target, cursor);
        if (found === -1) {
            parts.push({ text: text.slice(cursor), match: false });
            break;
        }
        if (found > cursor) {
            parts.push({ text: text.slice(cursor, found), match: false });
        }
        parts.push({ text: text.slice(found, found + target.length), match: true });
        cursor = found + target.length;
    }

    return parts.length > 0 ? parts : [{ text, match: false }];
};
