import { getDb, getSchema, eq } from '../shared.js';

export function updateContactLocation(upeerId: string, address: string) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.contacts)
        .set({ address, lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function updateContactDhtLocation(
    upeerId: string,
    address: string,
    dhtSeq: number,
    dhtSignature: string,
    dhtExpiresAt?: number,
    renewalToken?: any
) {
    const db = getDb();
    const schema = getSchema();

    // Merge the incoming IP into knownAddresses (multi-device support).
    // knownAddresses is a JSON string[]; we keep up to 20 unique IPs.
    const existing = db.select({ knownAddresses: schema.contacts.knownAddresses })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { knownAddresses: string } | undefined;

    let known: string[] = [];
    try {
        known = JSON.parse(existing?.knownAddresses ?? '[]');
    } catch { known = []; }

    if (!known.includes(address)) {
        known.unshift(address); // newest first
        if (known.length > 20) known = known.slice(0, 20);
    }

    const updateData: any = {
        address,            // primary (most recent)
        dhtSeq,
        dhtSignature,
        knownAddresses: JSON.stringify(known),
        lastSeen: new Date().toISOString()
    };
    if (dhtExpiresAt !== undefined) updateData.dhtExpiresAt = dhtExpiresAt;
    if (renewalToken !== undefined) updateData.renewalToken = JSON.stringify(renewalToken);

    return db.update(schema.contacts)
        .set(updateData)
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}