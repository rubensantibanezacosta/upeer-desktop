export const parseMessageTimestamp = (value?: string | number | null): number | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
        return asNumber;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

export const formatMessageTime = (value?: string | number | null): string => {
    const timestamp = parseMessageTimestamp(value);
    if (timestamp === null) {
        return '';
    }
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000 && now.getDate() === date.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
};

export const messageTimestampValue = (value?: string | number | null): number => {
    return parseMessageTimestamp(value) ?? 0;
};