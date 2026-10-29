import { getDb, getSchema } from '../shared.js';
import { getAlias, getMyUPeerId } from '../../security/identity.js';
import type { LatestReactionPreview } from '../../../types/chat.js';
import type { LatestReaction } from './latestReaction.js';

type ActorRow = { upeerId?: string | null; name?: string | null; alias?: string | null };

export function actorNamesFrom(rows: ActorRow[]): Map<string, string> {
    const names = new Map<string, string>();
    for (const row of rows) {
        const id = (row.upeerId ?? '').toLowerCase();
        const label = (row.name || row.alias || '').trim();
        if (id && label && !names.has(id)) names.set(id, label);
    }
    return names;
}

export function reactionActorNames(): Map<string, string> {
    const db = getDb();
    const schema = getSchema();
    return actorNamesFrom(db.select().from(schema.contacts).all() as ActorRow[]);
}

export function buildReactionPreview(reaction: LatestReaction, names: Map<string, string>): LatestReactionPreview {
    const actor = reaction.actorUpeerId.toLowerCase();
    const isMe = getMyUPeerId().toLowerCase() === actor;
    return {
        emoji: reaction.emoji,
        message: reaction.message ?? '',
        timestamp: reaction.timestamp,
        actorUpeerId: reaction.actorUpeerId,
        actorName: isMe ? getAlias() : names.get(actor) ?? '',
        actorIsMe: isMe
    };
}
