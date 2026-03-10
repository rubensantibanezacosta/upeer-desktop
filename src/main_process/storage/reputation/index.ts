import { getDb, getSchema } from '../shared.js';
import { eq, and, gte, inArray } from 'drizzle-orm';

export interface StoredVouch {
    id: string;
    fromId: string;
    toId: string;
    type: string;
    positive: boolean;
    timestamp: number;
    signature: string;
    receivedAt: number;
}

export function insertVouch(vouch: StoredVouch): boolean {
    try {
        const db = getDb();
        const schema = getSchema();
        db.insert(schema.reputationVouches)
            .values({
                id: vouch.id,
                fromId: vouch.fromId,
                toId: vouch.toId,
                type: vouch.type,
                positive: vouch.positive,
                timestamp: vouch.timestamp,
                signature: vouch.signature,
                receivedAt: vouch.receivedAt,
            })
            .onConflictDoNothing()
            .run();
        return true;
    } catch {
        return false;
    }
}

export function vouchExists(id: string): boolean {
    try {
        const db = getDb();
        const schema = getSchema();
        return !!db.select({ id: schema.reputationVouches.id })
            .from(schema.reputationVouches)
            .where(eq(schema.reputationVouches.id, id))
            .get();
    } catch {
        return false;
    }
}

export function getVouchIds(since: number = 0): string[] {
    try {
        const db = getDb();
        const schema = getSchema();
        return db.select({ id: schema.reputationVouches.id })
            .from(schema.reputationVouches)
            .where(gte(schema.reputationVouches.timestamp, since))
            .all()
            .map(r => r.id);
    } catch {
        return [];
    }
}

export function getVouchesByIds(ids: string[]): StoredVouch[] {
    if (ids.length === 0) return [];
    try {
        const db = getDb();
        const schema = getSchema();
        return db.select()
            .from(schema.reputationVouches)
            .where(inArray(schema.reputationVouches.id, ids))
            .all() as unknown as StoredVouch[];
    } catch {
        return [];
    }
}

export function getVouchesForNode(toId: string, since: number = 0): StoredVouch[] {
    try {
        const db = getDb();
        const schema = getSchema();
        return db.select()
            .from(schema.reputationVouches)
            .where(and(
                eq(schema.reputationVouches.toId, toId),
                gte(schema.reputationVouches.timestamp, since)
            ))
            .all() as unknown as StoredVouch[];
    } catch {
        return [];
    }
}

export function countRecentVouchesByFrom(fromId: string, since: number): number {
    try {
        const db = getDb();
        const schema = getSchema();
        return db.select({ id: schema.reputationVouches.id })
            .from(schema.reputationVouches)
            .where(and(
                eq(schema.reputationVouches.fromId, fromId),
                gte(schema.reputationVouches.timestamp, since)
            ))
            .all().length;
    } catch {
        return 0;
    }
}
