import { eq } from 'drizzle-orm';
import { debug, info, warn } from '../../security/secure-logger.js';
import { distributedAssets } from '../../storage/schema.js';
import { getDb } from '../../storage/shared.js';
import { VAULT_TTL_MS } from './manager.js';
import { ErasureCoder } from './redundancy/erasure.js';

export async function repairVaultAsset(
    fileHash: string,
    reconstructSegment: (fileHash: string, segIdx: number, shards: any[]) => Promise<void>,
    collectMissingShards: (fileHash: string, segIdx: number, missingIndices: number[]) => Promise<void>
): Promise<void> {
    info('Repairing degraded asset (segment-aware)', { fileHash }, 'vault');

    try {
        const db = getDb();
        const shards = await db.select()
            .from(distributedAssets)
            .where(eq(distributedAssets.fileHash, fileHash));

        if (shards.length === 0) {
            return;
        }

        const segments = new Map<number, any[]>();
        for (const shard of shards) {
            const segmentIndex = (shard as any).segmentIndex || 0;
            let segmentShards = segments.get(segmentIndex);
            if (!segmentShards) {
                segmentShards = [];
                segments.set(segmentIndex, segmentShards);
            }
            segmentShards.push(shard);
        }

        for (const [segIdx, segShards] of segments.entries()) {
            const existingIndices = new Set(segShards.map(shard => shard.shardIndex));
            const allIndices = Array.from({ length: 12 }, (_, index) => index);
            const missingIndices = allIndices.filter(index => !existingIndices.has(index));

            if (segShards.length >= 4) {
                await reconstructSegment(fileHash, segIdx, segShards);
                continue;
            }

            if (missingIndices.length > 0) {
                await collectMissingShards(fileHash, segIdx, missingIndices);
            }
        }
    } catch (err) {
        warn('Repair failed for asset', { fileHash, error: err }, 'vault');
    }
}

export async function reconstructVaultSegment(
    fileHash: string,
    segIdx: number,
    shards: any[],
    redistributeSegmentShards: (fileHash: string, segIdx: number, segmentData: Buffer) => Promise<void>
): Promise<void> {
    info('Reconstructing segment from shards', { fileHash, segIdx, shardCount: shards.length }, 'vault');

    try {
        const shardObjects = shards.map(shard => ({
            index: shard.shardIndex,
            data: Buffer.from(shard.data, 'hex')
        }));

        const shardSize = shardObjects[0].data.length;
        const originalSize = shardSize * 4;

        const coder = new ErasureCoder(4, 8);
        const reconstructed = coder.decode(shardObjects, originalSize);
        if (!reconstructed) {
            warn('Failed to reconstruct file', { fileHash }, 'vault');
            return;
        }

        debug('Segment reconstructed successfully', { fileHash, segIdx, size: reconstructed.length }, 'vault');
        await redistributeSegmentShards(fileHash, segIdx, reconstructed);
    } catch (err) {
        warn('File reconstruction failed', { fileHash, error: err }, 'vault');
    }
}

export async function collectMissingVaultShards(fileHash: string, segIdx: number, missingIndices: number[]): Promise<void> {
    info('Collecting missing segments shards', { fileHash, segIdx, missingCount: missingIndices.length }, 'vault');

    const { sendSecureUDPMessage } = await import('../server/transport.js');
    const { getContacts } = await import('../../storage/contacts/operations.js');
    const { getMyUPeerId } = await import('../../security/identity.js');
    const contacts = await getContacts();
    const myId = getMyUPeerId();

    const custodians = contacts
        .filter(contact => contact.status === 'connected' && contact.upeerId !== myId)
        .slice(0, 8);

    if (custodians.length === 0) {
        warn('No connected custodians available for shard collection', { fileHash }, 'vault');
        return;
    }

    const requests = [];
    for (const index of missingIndices) {
        const payloadHash = `shard:${fileHash}:${segIdx}:${index}`;
        for (const custodian of custodians) {
            requests.push((async () => {
                try {
                    await sendSecureUDPMessage(custodian.address, {
                        type: 'VAULT_QUERY',
                        requesterSid: myId,
                        payloadHash,
                    });
                } catch (err: any) {
                    debug('Failed to send VAULT_QUERY', { custodian: custodian.upeerId, error: err }, 'vault');
                }
            })());
        }
    }

    await Promise.allSettled(requests);
    await new Promise(resolve => setTimeout(resolve, 10000));
}

export async function redistributeVaultSegmentShards(fileHash: string, segIdx: number, segmentData: Buffer): Promise<void> {
    info('Redistributing segment shards after repair', { fileHash, segIdx }, 'vault');

    const coder = new ErasureCoder(4, 8);
    const shards = coder.encode(segmentData);

    const { sendSecureUDPMessage } = await import('../server/transport.js');
    const { getContacts } = await import('../../storage/contacts/operations.js');
    const { getMyUPeerId } = await import('../../security/identity.js');
    const contacts = await getContacts();
    const myId = getMyUPeerId();

    const custodians = contacts
        .filter(contact => contact.status === 'connected' && contact.upeerId !== myId)
        .slice(0, 12);

    if (custodians.length < 4) {
        warn('Not enough custodians for redistribution', { fileHash }, 'vault');
        return;
    }

    for (let index = 0; index < shards.length; index++) {
        const shard = shards[index];
        const custodian = custodians[index % custodians.length];
        const payloadHash = `shard:${fileHash}:${segIdx}:${index}`;

        void (async () => {
            try {
                await sendSecureUDPMessage(custodian.address, {
                    type: 'VAULT_STORE',
                    payloadHash,
                    recipientSid: '*',
                    senderSid: myId,
                    priority: 2,
                    data: shard.toString('hex'),
                    expiresAt: Date.now() + VAULT_TTL_MS,
                });
            } catch (err: any) {
                debug('Failed to redistribute shard', { custodian: custodian.upeerId, error: err }, 'vault');
            }
        })();
    }

    info('Shard redistribution completed', { fileHash, shards: shards.length, custodians: custodians.length }, 'vault');
}