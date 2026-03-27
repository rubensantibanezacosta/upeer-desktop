import crypto from 'node:crypto';
import { getDb, getSchema, eq } from '../shared.js';
import { SurvivalKitData as PulseSyncData } from './types.js';
import { error } from '../../security/secure-logger.js';
import type { RenewalToken } from '../../network/types.js';

/**
 * PulseSync (antes Survival Kit)
 * Genera un "checkpoint" del estado global del usuario (Contactos, Tokens de Renovación) 
 * para ser sincronizado con dispositivos gemelos o usado como backup de emergencia.
 */
export function createPulseSync(name: string, description?: string): string {
    const db = getDb();
    const schema = getSchema();

    const kitId = crypto.randomUUID();
    const now = Date.now();
    const expires = now + (60 * 24 * 60 * 60 * 1000); // 60 days

    // Get all active contacts with location blocks
    const allContacts = db.select().from(schema.contacts).all();
    const activeContacts = allContacts.filter(c =>
        c.status === 'connected' &&
        c.dhtSignature &&
        c.dhtExpiresAt &&
        c.dhtExpiresAt > now
    );

    // Get top contacts
    const topContacts = activeContacts
        .sort((a, b) => {
            const aLastSeen = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
            const bLastSeen = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
            return bLastSeen - aLastSeen;
        })
        .slice(0, 50)
        .map(c => ({
            upeerId: c.upeerId || '',
            name: c.name,
            publicKey: c.publicKey || '',
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq || 0,
                signature: c.dhtSignature || '',
                expiresAt: c.dhtExpiresAt || 0,
            },
            lastSeen: c.lastSeen ? new Date(c.lastSeen).getTime() : now
        }));

    const renewalTokens: Array<{ targetId: string; token: RenewalToken }> = [];

    const pulseData: PulseSyncData = {
        version: '1.0',
        myUpeerId: '', // Will be filled by caller
        myPublicKey: '', // Will be filled by caller
        timestamp: now,
        contacts: topContacts,
        renewalTokens
    };

    db.insert(schema.backupPulseSync).values({
        kitId,
        name,
        description,
        data: JSON.stringify(pulseData),
        expires,
        isActive: true
    }).run();

    return kitId;
}

export function getPulseSync(pulseId: string): PulseSyncData | null {
    const db = getDb();
    const schema = getSchema();

    const result = db.select()
        .from(schema.backupPulseSync)
        .where(eq(schema.backupPulseSync.kitId, pulseId))
        .get();

    if (!result) return null;

    try {
        return JSON.parse(result.data);
    } catch (err) {
        error('Failed to parse pulse sync data', err, 'backup');
        return null;
    }
}
