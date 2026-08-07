import { getDb, getSchema } from '../shared.js';
import { eq, and, gte, inArray } from 'drizzle-orm';
import { warn } from '../../security/secure-logger.js';

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
    } catch (err) {
        warn('Failed to insert vouch', { id: vouch.id, error: err }, 'storage');
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
    } catch (err) {
        warn('Failed to check vouch existence', { id, error: err }, 'storage');
        return false;
    }
}

export function getVouchIds(since = 0): string[] {
    try {
        const db = getDb();
        const schema = getSchema();
        return db.select({ id: schema.reputationVouches.id })
            .from(schema.reputationVouches)
            .where(gte(schema.reputationVouches.timestamp, since))
            .all()
            .map(r => r.id);
    } catch (err) {
        warn('Failed to get vouch ids', { error: err }, 'storage');
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
            .all()
            .map((row) => ({
                id: row.id,
                fromId: row.fromId,
                toId: row.toId,
                type: row.type,
                positive: row.positive,
                timestamp: row.timestamp,
                signature: row.signature,
                receivedAt: row.receivedAt,
            }));
    } catch (err) {
        warn('Failed to get vouches by ids', { error: err }, 'storage');
        return [];
    }
}

export function getVouchesForNode(toId: string, since = 0): StoredVouch[] {
    try {
        const db = getDb();
        const schema = getSchema();
        return db.select()
            .from(schema.reputationVouches)
            .where(and(
                eq(schema.reputationVouches.toId, toId),
                gte(schema.reputationVouches.timestamp, since)
            ))
            .all()
            .map((row) => ({
                id: row.id,
                fromId: row.fromId,
                toId: row.toId,
                type: row.type,
                positive: row.positive,
                timestamp: row.timestamp,
                signature: row.signature,
                receivedAt: row.receivedAt,
            }));
    } catch (err) {
        warn('Failed to get vouches for node', { toId, error: err }, 'storage');
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
    } catch (err) {
        warn('Failed to count recent vouches', { fromId, error: err }, 'storage');
        return 0;
    }
}
