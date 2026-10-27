export interface StarredRow {
    id: string;
    chatUpeerId: string;
    message: string;
    timestamp: number;
    isMine: boolean;
}

export interface StarredChatGroup {
    chatId: string;
    name: string;
    kind: 'contact' | 'group';
    rows: StarredRow[];
}

export interface StarredChatName {
    id: string;
    name: string;
}

const MAX_CHAT_NAME = 32;

export const toStarredRow = (raw: Record<string, unknown>): StarredRow | null => {
    const id = typeof raw.id === 'string' ? raw.id : '';
    const chatUpeerId = typeof raw.chatUpeerId === 'string'
        ? raw.chatUpeerId
        : (typeof raw.upeerId === 'string' ? raw.upeerId : '');
    if (!id || !chatUpeerId || raw.isDeleted === true) return null;
    const timestamp = Number(raw.timestamp);
    return {
        id,
        chatUpeerId,
        message: typeof raw.message === 'string' ? raw.message : '',
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        isMine: raw.isMine === true,
    };
};

export const toStarredRows = (raw: unknown): StarredRow[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => (entry && typeof entry === 'object' ? toStarredRow(entry as Record<string, unknown>) : null))
        .filter((row): row is StarredRow => row !== null);
};

const shortened = (id: string): string => (id.length > MAX_CHAT_NAME ? `${id.slice(0, MAX_CHAT_NAME)}…` : id);

const nameOf = (chatId: string, contacts: StarredChatName[], groups: StarredChatName[]): { name: string; kind: 'contact' | 'group' } => {
    const group = groups.find((entry) => entry.id === chatId);
    if (group) return { name: group.name || shortened(chatId), kind: 'group' };
    const contact = contacts.find((entry) => entry.id === chatId);
    return { name: contact?.name || shortened(chatId), kind: 'contact' };
};

export const groupStarredByChat = (
    rows: StarredRow[],
    contacts: StarredChatName[],
    groups: StarredChatName[],
): StarredChatGroup[] => {
    const groupsById = new Map<string, StarredChatGroup>();
    [...rows]
        .sort((left, right) => right.timestamp - left.timestamp)
        .forEach((row) => {
            const existing = groupsById.get(row.chatUpeerId);
            if (existing) {
                existing.rows.push(row);
                return;
            }
            const meta = nameOf(row.chatUpeerId, contacts, groups);
            groupsById.set(row.chatUpeerId, { chatId: row.chatUpeerId, ...meta, rows: [row] });
        });
    return [...groupsById.values()];
};

export const starredIdsOf = (prefs: Record<string, { starred: boolean }>): string[] =>
    Object.entries(prefs)
        .filter(([, value]) => value.starred === true)
        .map(([id]) => id);
