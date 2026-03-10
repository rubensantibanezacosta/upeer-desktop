import { VaultStoreData, VaultQueryData } from '../../types.js';
import { saveVaultEntry, getVaultEntriesForRecipient, deleteVaultEntry, getSenderUsage, renewVaultEntry } from '../../../storage/vault/index.js';
import { security, network, warn, debug } from '../../../security/secure-logger.js';
import { computeScore, issueVouch, VouchType } from '../../../security/reputation/vouches.js';
import { VAULT_TTL_MS } from '../manager.js';

/** Número máximo de entradas por respuesta VAULT_DELIVERY (anti-OOM) */
const VAULT_DELIVERY_PAGE_SIZE = 50;

/**
 * Handles incoming VAULT_STORE requests from friends.
 * Stores the encrypted blob in the local SQLite vault.
 */
export async function handleVaultStore(senderSid: string, data: VaultStoreData, fromAddress?: string, sendResponse?: (ip: string, data: any) => void) {
    if (!data.payloadHash || !data.recipientSid || !data.data) {
        warn('Invalid VAULT_STORE packet', { senderSid }, 'vault');
        return;
    }

    // Protection: Only certain priorities allowed from friends for now
    if (data.priority > 3) {
        security('Invalid vault priority from peer', { senderSid, priority: data.priority }, 'vault');
        return;
    }

    // BUG AN fix: computeScore con Set vacío retorna siempre 50 porque
    // computeScorePure filtra todos los vouches que no provengan de directContactIds.
    // Si el conjunto está vacío, delta=0 → score=50 siempre → protección Sybil nunca dispara
    // y los tiers de cuota (score>=65, >=80) nunca aplican. Hay que pasar los contactos reales.
    const { getContacts: _getContactsForScore } = await import('../../../storage/db.js');
    const _allContacts = _getContactsForScore() as any[];
    const _directIds = new Set<string>(
        _allContacts
            .filter((c: any) => c.status === 'connected' && c.upeerId)
            .map((c: any) => c.upeerId as string)
    );
    const vouchScore = computeScore(senderSid, _directIds);
    if (vouchScore < 30) {
        security('Refusing vault storage for untrusted node', { senderSid, vouchScore }, 'vault');
        return;
    }

    // Tiered Quotas based on vouchScore
    let quota = 5 * 1024 * 1024; // New/Casual: 5MB
    if (vouchScore >= 80) {
        quota = 1000 * 1024 * 1024; // Highly Trusted: 1GB
    } else if (vouchScore >= 65) {
        quota = 100 * 1024 * 1024;  // Known Peer: 100MB
    }

    const currentUsage = await getSenderUsage(senderSid);
    const incomingSize = data.data.length / 2;

    if (currentUsage + incomingSize > quota) {
        warn('Vault quota exceeded for sender', { senderSid, usage: currentUsage, quota, incoming: incomingSize }, 'vault');
        return;
    }

    try {
        // BUG H fix: cap expiresAt al máximo permitido (60 días desde ahora)
        // El remitente no puede imponer TTLs arbitrariamente largos.
        const safeExpiresAt = Math.min(data.expiresAt, Date.now() + VAULT_TTL_MS);

        // BUG CE fix: usar senderSid autenticado (parámetro exterior) en lugar de
        // data.senderSid (campo interior, controlado por el emisor). Sin esto, un
        // atacante puede poner data.senderSid=victimId, haciendo que los registros
        // almacenados no se cuenten contra su cuota (getSenderUsage busca por el
        // campo almacenado, que sería victimId, no el atacante).
        await saveVaultEntry(
            data.payloadHash,
            data.recipientSid,
            senderSid,    // ← senderSid autenticado por firma exterior, no data.senderSid
            data.priority,
            data.data,
            safeExpiresAt
        );
        debug('Vault entry saved', { hash: data.payloadHash, recipient: data.recipientSid }, 'vault');

        // Send confirmation back to the sender
        if (fromAddress && sendResponse) {
            sendResponse(fromAddress, {
                type: 'VAULT_ACK',
                payloadHashes: [data.payloadHash]
            });
        }
    } catch (err) {
        warn('Failed to save vault entry', { hash: data.payloadHash, error: err }, 'vault');
    }
}

/**
 * Handles VAULT_QUERY requests from users checking for their offline messages.
 * Verifies the requester's identity before delivering entries.
 */
export async function handleVaultQuery(
    senderSid: string,
    data: VaultQueryData,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
) {
    // SECURITY: Users can only query their OWN social ID
    if (senderSid !== data.requesterSid) {
        security('Unauthorized vault query attempt', {
            sender: senderSid,
            target: data.requesterSid,
            ip: fromAddress
        }, 'vault');
        return;
    }

    try {
        const allEntries = await getVaultEntriesForRecipient(data.requesterSid);

        if (allEntries.length > 0) {
            // BUG K fix: paginar la respuesta para evitar paquetes OOM.
            // Enviamos hasta VAULT_DELIVERY_PAGE_SIZE entradas por respuesta.
            // El receptor puede re-consultar con offset si hasMore === true.
            const offset = data.offset ?? 0;
            const page = allEntries.slice(offset, offset + VAULT_DELIVERY_PAGE_SIZE);
            const hasMore = offset + VAULT_DELIVERY_PAGE_SIZE < allEntries.length;

            network('Delivering vault entries', undefined, {
                recipient: data.requesterSid,
                count: page.length,
                hasMore,
            }, 'vault');

            // Send batch delivery
            sendResponse(fromAddress, {
                type: 'VAULT_DELIVERY',
                entries: page,
                hasMore,
                nextOffset: hasMore ? offset + VAULT_DELIVERY_PAGE_SIZE : undefined,
            });
        }
    } catch (err) {
        warn('Vault query processing failed', { error: err }, 'vault');
    }
}

/**
 * Handles VAULT_ACK from a user confirming they've received the messages.
 * This triggers deletion from our local custody.
 */
export async function handleVaultAck(senderSid: string, data: { payloadHashes: string[] }) {
    if (!Array.isArray(data.payloadHashes)) return;

    for (const hash of data.payloadHashes) {
        // BUG CF fix: verificar que el remitente del ACK es el destinatario legítimo
        // de la entrada antes de borrarla. Sin esta comprobación, cualquier peer
        // autenticado podía enviar VAULT_ACK con el hash de mensajes ajenos y borrarlos
        // del custodio, impidiendo que el destinatario real los recuperara.
        const entry = await (await import('../../../storage/vault/index.js')).getVaultEntryByHash(hash);
        if (!entry) {
            debug('Received VAULT_ACK for unknown entry, rewarding custodian', { hash, custodian: senderSid }, 'vault');
            issueVouch(senderSid, VouchType.VAULT_CHUNK).catch(() => { });
            continue;
        }
        if (entry.recipientSid !== senderSid) {
            security('VAULT_ACK de no-destinatario — ignorado', { hash, sender: senderSid, recipient: entry.recipientSid }, 'vault');
            issueVouch(senderSid, VouchType.MALICIOUS).catch(() => { });
            continue;
        }
        const deleted = await deleteVaultEntry(hash);
        if (deleted) {
            debug('Vault entry cleared after delivery ACK', { hash, from: senderSid }, 'vault');
            issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch(() => { });
        }
    }
}

/**
 * Handles VAULT_RENEW from another node requesting that we extend the TTL
 * of a vault entry we are custodying.
 *
 * Security rules:
 *  - Only extends TTL, never shortens it.
 *  - Caps the new expiresAt to Date.now() + VAULT_TTL_MS (60 days max).
 *
 * NOTE: No se filtra por senderSid porque el que renueva puede ser cualquier
 * custodio (no necesariamente el emisor original). El único abuso posible sería
 * extender TTLs indefinidamente, pero el cap a 60 días lo previene. Requerir
 * senderSid === entry.senderSid rompería el ciclo de renovación del RepairWorker,
 * que renueva desde su propia identidad, no desde la del emisor original.
 */
export async function handleVaultRenew(
    senderSid: string,
    data: { payloadHash: string; newExpiresAt: number }
) {
    if (!data.payloadHash || typeof data.newExpiresAt !== 'number') {
        warn('Invalid VAULT_RENEW packet', { senderSid }, 'vault');
        return;
    }

    // Cap: máximo 60 días desde ahora. Esto es la protección real: ningún peer
    // puede imponer TTLs arbitrariamente largos independientemente de quién sea.
    const maxExpiry = Date.now() + VAULT_TTL_MS;
    const safeExpiry = Math.min(data.newExpiresAt, maxExpiry);

    const renewed = await renewVaultEntry(data.payloadHash, safeExpiry);
    if (renewed) {
        debug('Vault entry TTL extended by VAULT_RENEW', { hash: data.payloadHash.slice(0, 8), from: senderSid }, 'vault');
    } else {
        debug('VAULT_RENEW for unknown entry, ignoring', { hash: data.payloadHash.slice(0, 8), from: senderSid }, 'vault');
    }
}
