import { getContacts } from '../../storage/contacts/operations.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { getMyUPeerId } from '../../security/identity.js';
import { info, warn, debug } from '../../security/secure-logger.js';
import crypto from 'node:crypto';
import { getKademliaInstance } from '../dht/shared.js';
import { createVaultPointerKey } from '../dht/kademlia/store.js';
import { getVouchScore } from '../../security/reputation/vouches.js';

export const VAULT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const SHARD_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const VAULT_RENEW_MS = 45 * 24 * 60 * 60 * 1000;

export class VaultManager {
    private static DEFAULT_REPLICATION_FACTOR = 6;
    private static MAX_REPLICATION_FACTOR = 12;
    private static MIN_REPLICATION_FACTOR = 3;

    private static async getDynamicReplicationFactor(recipientSid: string): Promise<number> {
        try {
            const score = await getVouchScore(recipientSid);
            const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
            const contact = await getContactByUpeerId(recipientSid);

            const now = Date.now();
            const firstSeen = contact?.createdAt ? new Date(contact.createdAt).getTime() : now;
            const lastSeen = contact?.lastSeen ? new Date(contact.lastSeen).getTime() : 0;
            const daysKnown = Math.max(0, (now - firstSeen) / (1000 * 3600 * 24));
            const isStable = daysKnown > 7 && (now - lastSeen) < (1000 * 3600 * 48);

            const highTenure = daysKnown > 30;
            const permanentTenure = daysKnown > 90;

            if (score >= 90 || (score >= 70 && isStable) || permanentTenure) return this.MIN_REPLICATION_FACTOR;
            if (score >= 70 || (score >= 50 && isStable) || highTenure) return this.DEFAULT_REPLICATION_FACTOR;
            if (score <= 30 || (!isStable && daysKnown < 1)) return this.MAX_REPLICATION_FACTOR;

            const range = 70 - 30;
            const factorRange = this.MAX_REPLICATION_FACTOR - this.DEFAULT_REPLICATION_FACTOR;
            const ratio = (70 - score) / range;
            return Math.round(this.DEFAULT_REPLICATION_FACTOR + (ratio * factorRange));
        } catch {
            return 8;
        }
    }

    private static async sendWithRetry(address: string, packet: any, maxRetries = 3, initialDelay = 1000): Promise<void> {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                await sendSecureUDPMessage(address, packet);
                return;
            } catch (err) {
                attempt++;
                if (attempt >= maxRetries) {
                    warn(`Failed to send vault packet to ${address} after ${maxRetries} attempts`, err, 'vault');
                    throw err; // Propagate error for better handling
                }
                const delay = initialDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    static async replicateToVaults(recipientSid: string, packet: any, ttlMs?: number, payloadHashOverride?: string): Promise<number> {
        const allContacts = await getContacts();
        const myId = getMyUPeerId();
        const kademlia = getKademliaInstance();

        const replicationFactor = await this.getDynamicReplicationFactor(recipientSid);

        let candidates = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId && c.upeerId !== recipientSid)
            .sort((a, b) => {
                const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
                const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
                return timeB - timeA;
            })
            .slice(0, replicationFactor);

        if (candidates.length === 0 && kademlia) {
            const meshNodes = kademlia.findClosestContacts(recipientSid, replicationFactor);
            candidates = meshNodes
                .filter(node => node.upeerId !== myId && node.upeerId !== recipientSid)
                .map(node => ({
                    upeerId: node.upeerId,
                    address: node.address,
                    status: 'connected'
                })) as any[];
        }

        if (candidates.length === 0) {
            const mySelf = allContacts.find(c => c.upeerId === myId);
            if (mySelf?.status === 'connected' && mySelf?.address) {
                candidates.push(mySelf);
            }
        }

        if (candidates.length === 0) {
            const recipient = allContacts.find(c => c.upeerId === recipientSid);
            if (recipient?.status === 'connected' && recipient?.address) {
                candidates.push(recipient);
            }
        }

        if (candidates.length === 0) {
            const selfPacketJson = JSON.stringify(packet);
            const selfHash = payloadHashOverride ?? crypto.createHash('sha256').update(selfPacketJson).digest('hex');
            const selfExpiresAt = Date.now() + (ttlMs ?? VAULT_TTL_MS);
            const { saveVaultEntry: saveLocal } = await import('../../storage/vault/operations.js');
            await saveLocal(selfHash, recipientSid, myId, 1, Buffer.from(selfPacketJson).toString('hex'), selfExpiresAt);
            info('Self-custodian: message stored locally for delivery on reconnect', { recipient: recipientSid, hash: selfHash.slice(0, 8) }, 'vault');
            return 1;
        }

        const packetJson = JSON.stringify(packet);
        const payloadHash = payloadHashOverride ?? crypto.createHash('sha256').update(packetJson).digest('hex');
        const expiresAt = Date.now() + (ttlMs ?? VAULT_TTL_MS);

        const isControlPacket = ['CHAT_CLEAR_ALL', 'CHAT_DELETE'].includes(packet.type);

        const vaultPacket = {
            type: 'VAULT_STORE',
            payloadHash,
            recipientSid,
            senderSid: myId,
            priority: isControlPacket ? 3 : (packet.type === 'CHAT' ? 1 : 2),
            data: Buffer.from(packetJson).toString('hex'),
            expiresAt,
        };

        const custodianIds: string[] = [];
        const sendPromises = candidates.map(async (friend) => {
            try {
                await this.sendWithRetry(friend.address, vaultPacket);
                if (friend.upeerId) return friend.upeerId;
            } catch (err) {
                return null;
            }
            return null;
        });

        const results = await Promise.all(sendPromises);
        const successfulIds = results.filter((id): id is string => !!id);

        if (kademlia && successfulIds.length > 0) {
            const ptrKey = createVaultPointerKey(recipientSid);
            const ptrValue = { custodians: successfulIds, updatedAt: Date.now() };
            kademlia.storeValue(ptrKey, ptrValue, myId).catch(err => {
                warn('Failed to publish vault pointer to DHT', err, 'vault');
            });
        }

        info('Message replicated to vaults', {
            recipient: recipientSid,
            nodes: successfulIds.length,
            hash: payloadHash.slice(0, 8),
            dht: !!kademlia
        }, 'vault');

        return successfulIds.length;
    }

    static async queryOwnVaults() {
        const allContacts = await getContacts();
        const myId = getMyUPeerId();
        const onlineFriends = allContacts.filter(c => c.status === 'connected' && c.upeerId !== myId);

        const queryPacket = {
            type: 'VAULT_QUERY',
            requesterSid: myId,
            timestamp: Date.now()
        };

        const kademlia = getKademliaInstance();
        if (kademlia) {
            const ptrKey = createVaultPointerKey(myId);

            kademlia.findValue(ptrKey).then(async (ptrResult) => {
                if (ptrResult && ptrResult.value && Array.isArray(ptrResult.value.custodians)) {
                    const selfCustodians = ptrResult.value.custodians;

                    for (const custodianId of selfCustodians) {
                        if (custodianId === myId) continue;
                        try {
                            const addr = await kademlia.findLocationBlock(custodianId);
                            if (addr && addr.address) {
                                sendSecureUDPMessage(addr.address, queryPacket);
                            }
                        } catch (err) {
                            debug('Could not find self-custodian location', { custodianId }, 'vault');
                        }
                    }
                }
            }).catch(err => warn('Failed to find self-vault pointers in DHT', err, 'vault'));
        }

        for (const friend of onlineFriends) {
            sendSecureUDPMessage(friend.address, queryPacket);
        }
    }
}
