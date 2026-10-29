import { desc } from 'drizzle-orm';
import { getDb, getSchema } from '../shared.js';

export type LatestReaction = {
    chatUpeerId: string;
    messageId: string;
    emoji: string;
    actorUpeerId: string;
    timestamp: number;
    message: string | null;
    messageIsMine: boolean | null;
};

type ReactionRow = { messageId: string; upeerId: string; emoji: string; timestamp: number };
type MessageRow = { id: string; chatUpeerId: string | null; message: string | null; isMine: boolean | null };

export function getLatestReactionByChat(): Map<string, LatestReaction> {
    const db = getDb();
    const schema = getSchema();
    const reactions = db.select().from(schema.reactions)
        .orderBy(desc(schema.reactions.timestamp))
        .all() as ReactionRow[];
    const latest = new Map<string, LatestReaction>();
    if (reactions.length === 0) return latest;

    const messagesById = new Map<string, MessageRow>();
    for (const row of db.select().from(schema.messages).all() as MessageRow[]) {
        if (row?.id) messagesById.set(row.id, row);
    }

    for (const reaction of reactions) {
        const target = messagesById.get(reaction.messageId);
        const chatUpeerId = target?.chatUpeerId ?? '';
        if (chatUpeerId === '' || latest.has(chatUpeerId)) continue;
        latest.set(chatUpeerId, {
            chatUpeerId,
            messageId: reaction.messageId,
            emoji: reaction.emoji,
            actorUpeerId: reaction.upeerId,
            timestamp: Number(reaction.timestamp ?? 0),
            message: target?.message ?? null,
            messageIsMine: target?.isMine ?? null
        });
    }
    return latest;
}

export function reactionIsNewer(reaction: LatestReaction | undefined, lastMessageTime: number | string | null | undefined): boolean {
    if (!reaction) return false;
    const messageTime = lastMessageTime ? Number(lastMessageTime) : 0;
    return reaction.timestamp > messageTime;
}
