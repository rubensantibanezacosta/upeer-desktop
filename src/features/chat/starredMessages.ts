import type { ChatMessage } from '../../types/chat.js';
import type { MessageActionPrefs } from '../../store/useChatActionsStore.js';
import { summarizeSearchResult, type SearchResultSummary } from './searchResultMeta.js';
import { parseMessageTimestamp } from '../../utils/dateTime.js';

export interface StarredEntry {
    id: string;
    timestamp: number;
    isMine: boolean;
    summary: SearchResultSummary;
}

export const collectStarred = (
    history: ChatMessage[],
    prefs: Record<string, MessageActionPrefs>,
): StarredEntry[] => {
    const entries: StarredEntry[] = [];
    history.forEach((message) => {
        const id = message.id;
        if (!id || message.isDeleted || prefs[id]?.starred !== true) return;
        entries.push({
            id,
            timestamp: parseMessageTimestamp(message.timestamp) ?? 0,
            isMine: message.isMine === true,
            summary: summarizeSearchResult(message.message ?? ''),
        });
    });
    return entries.sort((left, right) => right.timestamp - left.timestamp);
};
