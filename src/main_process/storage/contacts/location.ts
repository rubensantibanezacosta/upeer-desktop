import { getDb, getSchema, eq } from '../shared.js';
import { isYggdrasilAddress } from '../../network/utils.js';
import type { RenewalToken } from '../../network/types.js';

type KnownAddressesRow = {
    knownAddresses: string;
};

type ContactLocationUpdate = {
    address: string;
    dhtSeq: number;
    dhtSignature: string;
    knownAddresses: string;
    lastSeen: string;
    dhtExpiresAt?: number;
    renewalToken?: string;
};

export async function updateContactLocation(upeerId: string, address: string) {
    const db = getDb();
    const schema = getSchema();

    // Re-use merging logic to avoid losing other paths
    const existing = db.select({ knownAddresses: schema.contacts.knownAddresses })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as KnownAddressesRow | undefined;

    let known: string[] = [];
    try {
        known = JSON.parse(existing?.knownAddresses ?? '[]');
    } catch { known = []; }

    const idx = known.indexOf(address);
    if (idx !== -1) known.splice(idx, 1);
    known.unshift(address);
    if (known.length > 20) known = known.slice(0, 20);

    return db.update(schema.contacts)
        .set({
            address, // Set as primary
            knownAddresses: JSON.stringify(known),
            lastSeen: new Date().toISOString()
        })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function updateContactDhtLocation(
    upeerId: string,
    addressOrAddresses: string | string[],
    dhtSeq: number,
    dhtSignature: string,
    dhtExpiresAt?: number,
    renewalToken?: RenewalToken
) {
    const db = getDb();
    const schema = getSchema();

    const rawIncoming = Array.isArray(addressOrAddresses) ? addressOrAddresses : [addressOrAddresses];
    const incoming = rawIncoming.filter(isYggdrasilAddress);
    if (incoming.length === 0) return;
    const primary = incoming[0];

    // Merge logic: newest IPs at the front, limit to 20
    const existing = db.select({ knownAddresses: schema.contacts.knownAddresses })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as KnownAddressesRow | undefined;

    let known: string[] = [];
    try {
        known = JSON.parse(existing?.knownAddresses ?? '[]');
    } catch { known = []; }

    for (const addr of incoming) {
        const idx = known.indexOf(addr);
        if (idx !== -1) known.splice(idx, 1);
        known.unshift(addr);
    }
    if (known.length > 20) known = known.slice(0, 20);

    const updateData: ContactLocationUpdate = {
        address: primary,
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