import { getDb, getSchema, eq } from '../shared.js';
import sodium from 'sodium-native';

/**
 * Compute a short BLAKE2b fingerprint (8 hex groups of 4 chars) from a hex public key.
 * Shown in the UI so users can verify identity out-of-band.
 */
export function computeKeyFingerprint(pubKeyHex: string): string {
    const hash = Buffer.alloc(16);
    sodium.crypto_generichash(hash, Buffer.from(pubKeyHex, 'hex'));
    // Format: XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX (8 groups of 4 hex chars)
    const hex = hash.toString('hex');
    return hex.match(/.{4}/g)!.join(' ').toUpperCase();
}

/**
 * Update the static public key for a contact.
 * Returns { changed: true, oldKey, newKey } if the key changed — the caller
 * should emit a TOFU alert to the UI in that case.
 */
export function updateContactPublicKey(upeerId: string, publicKey: string): { changed: boolean; oldKey?: string; newKey: string } {
    const db = getDb();
    const schema = getSchema();

    const existing = db.select({ publicKey: schema.contacts.publicKey })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { publicKey: string | null } | undefined;

    const oldKey = existing?.publicKey ?? undefined;
    const changed = !!oldKey && oldKey !== publicKey;

    db.update(schema.contacts)
        .set({ publicKey, status: 'connected' })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();

    return { changed, oldKey, newKey: publicKey };
}

export function updateContactEphemeralPublicKey(upeerId: string, ephemeralPublicKey: string) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.contacts)
        .set({ ephemeralPublicKey, ephemeralPublicKeyUpdatedAt: new Date().toISOString() })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

/**
 * Guardar el Signed PreKey (SPK) de un contacto, recibido en HANDSHAKE.
 * Verificar la firma ANTES de llamar a esta función.
 */
export function updateContactSignedPreKey(
    upeerId: string,
    spkPub: string,
    spkSig: string,
    spkId: number
): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.contacts)
        .set({ signedPreKey: spkPub, signedPreKeySignature: spkSig, signedPreKeyId: spkId })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}