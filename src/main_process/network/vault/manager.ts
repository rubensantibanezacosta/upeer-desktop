import { getContacts } from '../../storage/db.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { getMyUPeerId } from '../../security/identity.js';
import { info, warn, debug } from '../../security/secure-logger.js';
import crypto from 'node:crypto';
import { getKademliaInstance } from '../dht/shared.js';
import { createVaultPointerKey } from '../dht/kademlia/index.js';

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
        const kademlia = getKademliaInstance();

        let candidates = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId && c.upeerId !== recipientSid)
            // Sort by lastSeen as a proxy for reliability/uptime
            .sort((a, b) => {
                const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
                const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
                return timeB - timeA;
            })
            .slice(0, this.MESSAGE_REPLICATION_FACTOR);

        // 1b. Social Mesh Fallback: If no direct friends are online, use Kademlia to find
        // nodes "close" to the recipient in the network space.
        if (candidates.length === 0 && kademlia) {
            debug('No friends online, using DHT mesh for vaulting', { recipientSid }, 'vault');
            const meshNodes = kademlia.findClosestContacts(recipientSid, this.MESSAGE_REPLICATION_FACTOR);
            candidates = meshNodes
                .filter(node => node.upeerId !== myId && node.upeerId !== recipientSid)
                .map(node => ({
                    upeerId: node.upeerId,
                    address: node.address,
                    status: 'connected' // Virtual status for the mesh node
                })) as any[];
        }

        if (candidates.length === 0) {
            warn('No candidates found (friends or mesh) to act as vault', { recipientSid }, 'vault');
            return 0;
        }

        // 2. Prepare the vault storage packet
        const packetJson = JSON.stringify(packet);
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
        const custodianIds: string[] = [];
        for (const friend of candidates) {
            sendSecureUDPMessage(friend.address, vaultPacket);
            if (friend.upeerId) custodianIds.push(friend.upeerId);
        }

        // 4. Publish Pointer to DHT (Key: hash(vault-ptr:%recipientSid%), Value: json[custodianIds])
        // Esto permite que el destinatario descubra que estos nodos tienen mensajes para él,
        // incluso si el emisor (nosotros) se desconecta.
        if (kademlia && custodianIds.length > 0) {
            const ptrKey = createVaultPointerKey(recipientSid);
            // El valor es un array de IDs de custodios con un timestamp
            const ptrValue = {
                custodians: custodianIds,
                updatedAt: Date.now()
            };
            // Almacenar en la DHT sin firma (es un puntero público de red)
            kademlia.storeValue(ptrKey, ptrValue, myId).catch(err => {
                warn('Failed to publish vault pointer to DHT', err, 'vault');
            });
        }

        info('Message replicated to vaults', {
            recipient: recipientSid,
            nodes: candidates.length,
            hash: payloadHash.slice(0, 8),
            dht: !!kademlia
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

        // 1. First, query all direct friends already online
        const queryPacket = {
            type: 'VAULT_QUERY',
            requesterSid: myId,
            timestamp: Date.now()
        };

        debug('Querying friends for offline messages', { friendCount: onlineFriends.length }, 'vault');
        for (const friend of onlineFriends) {
            sendSecureUDPMessage(friend.address, queryPacket);
        }

        // 2. Discover extra custodians via DHT pointers
        // Esto cubre casos donde personas que NO son amigos directos (o amigos offline)
        // dejaron mensajes en nodos que SÍ podemos alcanzar.
        const kademlia = getKademliaInstance();
        if (kademlia) {
            const ptrKey = createVaultPointerKey(myId);
            const ptrResult = await kademlia.findValue(ptrKey);

            if (ptrResult && ptrResult.value && Array.isArray(ptrResult.value.custodians)) {
                const extraCustodians = ptrResult.value.custodians as string[];
                debug('Found extra custodians in DHT', { count: extraCustodians.length }, 'vault');

                for (const custodianId of extraCustodians) {
                    if (custodianId === myId) continue;
                    // Solo consultamos si no es un amigo que ya consultamos arriba
                    if (onlineFriends.some(f => f.upeerId === custodianId)) continue;

                    // Necesitamos la dirección del custodio. Si no la tenemos, la buscamos en la DHT.
                    const contact = allContacts.find(c => c.upeerId === custodianId);
                    if (contact && contact.address) {
                        sendSecureUDPMessage(contact.address, queryPacket);
                    } else {
                        // Búsqueda recursiva suave: pedir ubicación y luego consultar vault
                        try {
                            const addr = await kademlia.findLocationBlock(custodianId);
                            if (addr && addr.address) {
                                sendSecureUDPMessage(addr.address, queryPacket);
                            }
                        } catch (err) {
                            debug('Could not find extra custodian location', { custodianId }, 'vault');
                        }
                    }
                }
            }
        }
    }
}
