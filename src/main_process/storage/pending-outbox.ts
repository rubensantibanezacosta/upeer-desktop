/**
 * Pending Outbox — mensajes en cola para contactos sin clave pública aún.
 *
 * Cuando Alice quiere enviar un mensaje a Bob pero Bob nunca ha conectado
 * (contact.status = 'pending', contact.publicKey = null), no podemos cifrar
 * ni vaultear el mensaje. Lo guardamos aquí (protegido por SQLCipher) hasta
 * que Bob conecte por primera vez y enviemos su HANDSHAKE con su clave pública.
 *
 * Flujo:
 *   sendUDPMessage() → no pubkey → savePendingOutboxMessage()
 *   HANDSHAKE handler → got pubkey → flushPendingOutbox(upeerId)
 *     → re-encrypt con pubkey → VaultManager.replicateToVaults()
 */
import { eq } from 'drizzle-orm';
import { getDb } from './shared.js';
import { pendingOutbox } from './schema.js';
import { debug, warn } from '../security/secure-logger.js';

export async function savePendingOutboxMessage(
    recipientSid: string,
    msgId: string,
    plaintext: string,
    replyTo?: string
): Promise<void> {
    const db = getDb();
    await db.insert(pendingOutbox).values({
        msgId,
        recipientSid,
        plaintext,
        replyTo: replyTo ?? null,
        createdAt: Date.now(),
    });
    debug('Pending outbox: message queued', { recipientSid, msgId }, 'vault');
}

export async function getPendingOutboxMessages(recipientSid: string) {
    const db = getDb();
    return db.select().from(pendingOutbox)
        .where(eq(pendingOutbox.recipientSid, recipientSid));
}

export async function deletePendingOutboxMessage(id: number): Promise<void> {
    const db = getDb();
    await db.delete(pendingOutbox).where(eq(pendingOutbox.id, id));
}

/**
 * Vacía la outbox para un contacto que acaba de proporcionar su clave pública.
 * Cifra cada mensaje con la clave recibida y lo envía al vault para que el
 * destinatario lo reciba en cuanto conecte (aunque sea en otro dispositivo).
 */
export async function flushPendingOutbox(
    recipientSid: string,
    recipientPublicKeyHex: string
): Promise<void> {
    const messages = await getPendingOutboxMessages(recipientSid);
    if (messages.length === 0) return;

    debug('Flushing pending outbox', { recipientSid, count: messages.length }, 'vault');

    const { encrypt, getMyUPeerId, sign } = await import('../security/identity.js');
    const { canonicalStringify } = await import('../network/utils.js');
    const { VaultManager } = await import('../network/vault/manager.js');
    const myId = getMyUPeerId();

    for (const entry of messages) {
        try {
            // Re-cifrar con la clave estática recién recibida
            const { ciphertext, nonce } = encrypt(
                Buffer.from(entry.plaintext, 'utf-8'),
                Buffer.from(recipientPublicKeyHex, 'hex')
            );

            // BUG J fix: usar el msgId original grabado en la outbox en vez de generar
            // uno nuevo. Sin esto, el remitente ve el mensaje con un UUID y el vault lo
            // entrega con otro → el receptor ve duplicados y el historial desincroniza.
            const vaultData = {
                type: 'CHAT',
                id: entry.msgId,
                content: ciphertext,
                nonce: nonce,
                replyTo: entry.replyTo ?? undefined,
            };

            const sig = sign(Buffer.from(canonicalStringify(vaultData)));
            const innerPacket = {
                ...vaultData,
                senderUpeerId: myId,
                signature: sig.toString('hex'),
            };

            await VaultManager.replicateToVaults(recipientSid, innerPacket);
            if (entry.id) {
                await deletePendingOutboxMessage(entry.id);
            }

            debug('Pending outbox: message vaulted and removed', { id: entry.id, recipientSid }, 'vault');
        } catch (err) {
            warn('Pending outbox: failed to flush message', { id: entry.id, error: err }, 'vault');
        }
    }
}
