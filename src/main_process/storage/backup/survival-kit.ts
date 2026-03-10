import crypto from 'node:crypto';
import { getDb, getSchema, eq } from '../shared.js';
import { SurvivalKitData } from './types.js';
import { info, error } from '../../security/secure-logger.js';

export function createSurvivalKit(name: string, description?: string): string {
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
    
    // Get top 10 most active contacts
    const topContacts = activeContacts
        .sort((a, b) => {
            const aLastSeen = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
            const bLastSeen = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
            return bLastSeen - aLastSeen;
        })
        .slice(0, 10)
        .map(c => ({
            upeerId: c.upeerId || '',
            name: c.name,
            publicKey: c.publicKey || '',
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq || 0,
                signature: c.dhtSignature || '',
                expiresAt: c.dhtExpiresAt || 0,
                // Note: renewal tokens not stored in contacts yet
            },
            lastSeen: c.lastSeen ? new Date(c.lastSeen).getTime() : now
        }));
    
    // In a real implementation, we would need to get renewal tokens
    // For now, we'll create an empty array
    const renewalTokens: Array<{ targetId: string, token: any }> = [];
    
    const kitData: SurvivalKitData = {
        version: '1.0',
        myUpeerId: '', // Will be filled by caller
        myPublicKey: '', // Will be filled by caller
        timestamp: now,
        contacts: topContacts,
        renewalTokens
    };
    
    db.insert(schema.backupSurvivalKit).values({
        kitId,
        name,
        description,
        data: JSON.stringify(kitData),
        expires,
        isActive: true
    }).run();
    
    return kitId;
}

export function getSurvivalKit(kitId: string): SurvivalKitData | null {
    const db = getDb();
    const schema = getSchema();
    
    const result = db.select()
        .from(schema.backupSurvivalKit)
        .where(eq(schema.backupSurvivalKit.kitId, kitId))
        .get();
    
    if (!result) return null;
    
    try {
        return JSON.parse(result.data);
    } catch (err) {
        error('Failed to parse survival kit data', err, 'backup');
        return null;
    }
}