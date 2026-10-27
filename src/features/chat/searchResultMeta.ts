export type SearchResultKind = 'text' | 'file' | 'voice' | 'card';

export interface SearchResultSummary {
    kind: SearchResultKind;
    label: string;
}

const MAX_LABEL = 140;

const singleLine = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

const clamp = (raw: string): string => {
    const line = singleLine(raw);
    return line.length > MAX_LABEL ? `${line.slice(0, MAX_LABEL)}…` : line;
};

const parseJson = (raw: string): Record<string, unknown> | undefined => {
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
};

const textOr = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;
    const line = singleLine(value);
    return line ? clamp(line) : fallback;
};

export const summarizeSearchResult = (raw: string): SearchResultSummary => {
    const looksLikeJson = raw.startsWith('{') && raw.endsWith('}');
    if (!looksLikeJson) {
        return { kind: 'text', label: clamp(raw) || 'Mensaje' };
    }

    const parsed = parseJson(raw);
    if (!parsed) {
        return { kind: 'text', label: clamp(raw) || 'Mensaje' };
    }

    if (parsed.type === 'file' || parsed.kind === 'file') {
        const name = textOr(parsed.fileName ?? parsed.name, '');
        if (parsed.isVoiceNote) {
            return { kind: 'voice', label: name ? `Nota de voz · ${name}` : 'Nota de voz' };
        }
        return { kind: 'file', label: name || 'Archivo adjunto' };
    }

    if (parsed.type === 'contact_card') {
        const contact = typeof parsed.contact === 'object' && parsed.contact !== null ? parsed.contact as Record<string, unknown> : {};
        return { kind: 'card', label: textOr(contact.name, 'Tarjeta de contacto') };
    }

    if (typeof parsed.text === 'string') {
        return { kind: 'text', label: textOr(parsed.text, 'Mensaje') };
    }

    return { kind: 'text', label: 'Mensaje' };
};
