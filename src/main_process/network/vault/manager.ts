import { getContacts } from '../../storage/db.js';
import { sendSecureUDPMessage } from '../server.js';
import { getMyUPeerId } from '../../security/identity.js';
import { info, warn, debug } from '../../security/secure-logger.js';
import crypto from 'node:crypto';

/**
 * VaultManager orchestrates the distributed storage of offline messages and shards.
 */
// ── Constantes globales de resiliencia ──────────────────────────────────────
// Cambia VAULT_TTL_MS para ajustar la cobertura offline de toda la plataforma.
export const VAULT_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 días
export const SHARD_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 días (archivos)
export const VAULT_RENEW_MS = 45 * 24 * 60 * 60 * 1000; // renovar a los 45 d

export class VaultManager {
    // 6 copias: permite que hasta 2 custodios fallen antes de perder resiliencia
    private static MESSAGE_REPLICATION_FACTOR = 6;

    /**
     * Replicates a chat message or metadata to multiple trusted friends' vaults.
     * This is called as a fallback when direct P2P delivery fails.
     */
    static async replicateToVaults(recipientSid: string, packet: any, ttlMs?: number, payloadHashOverride?: string): Promise<number> {
        const allContacts = await getContacts();
        const myId = getMyUPeerId();

        // 1. Select candidates: connected friends, excluding sender and recipient
        const candidates = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId && c.upeerId !== recipientSid)
            // Sort by lastSeen as a proxy for reliability/uptime
            .sort((a, b) => {
                const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
                const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
                return timeB - timeA;
            })
            .slice(0, this.MESSAGE_REPLICATION_FACTOR);

        if (candidates.length === 0) {
            debug('No friends online to act as vault', { recipientSid }, 'vault');
            return 0;
        }

        // 2. Prepare the vault storage packet
        // We hex-encode the whole packet to preserve signatures and structure
        const packetJson = JSON.stringify(packet);
        // payloadHashOverride: permite al llamador fijar un CID determinista (e.g., group:msgId:memberSid)
        // para que múltiples nodos que vaulteen el mismo mensaje usen el mismo slot → sin duplicados.
        const payloadHash = payloadHashOverride ?? crypto.createHash('sha256').update(packetJson).digest('hex');
        const expiresAt = Date.now() + (ttlMs ?? VAULT_TTL_MS);

        const vaultPacket = {
            type: 'VAULT_STORE',
            payloadHash,
            recipientSid,
            senderSid: myId,
            priority: 1, // High priority for text messages
            data: Buffer.from(packetJson).toString('hex'),
            expiresAt,
        };

        // 3. Fan-out to candidates
        for (const friend of candidates) {
            sendSecureUDPMessage(friend.address, vaultPacket);
        }

        info('Message replicated to vaults', {
            recipient: recipientSid,
            nodes: candidates.length,
            hash: payloadHash.slice(0, 8)
        }, 'vault');

        return candidates.length;
    }


    /**
     * Queries all online friends for any messages they might be holding for us.
     * Called at startup or periodic reconnection.
     */
    static async queryOwnVaults() {
        const allContacts = await getContacts();
        const myId = getMyUPeerId();
        const onlineFriends = allContacts.filter(c => c.status === 'connected' && c.upeerId !== myId);

        if (onlineFriends.length === 0) return;

        const queryPacket = {
            type: 'VAULT_QUERY',
            requesterSid: myId,
            timestamp: Date.now()
        };

        debug('Querying friends for offline messages', { friendCount: onlineFriends.length }, 'vault');
        for (const friend of onlineFriends) {
            sendSecureUDPMessage(friend.address, queryPacket);
        }
    }
}
