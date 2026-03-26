import { eq } from 'drizzle-orm';
import { debug, info, warn } from '../../security/secure-logger.js';
import { redundancyHealth } from '../../storage/schema.js';
import { getDb } from '../../storage/shared.js';
import { getExpiringSoonEntries, renewVaultEntry } from '../../storage/vault/operations.js';
import { VAULT_RENEW_MS, VAULT_TTL_MS } from './manager.js';

export async function renewExpiringVaultEntries(): Promise<void> {
    const windowMs = VAULT_TTL_MS - VAULT_RENEW_MS;

    try {
        const expiringSoon = await getExpiringSoonEntries(windowMs);
        if (expiringSoon.length === 0) {
            return;
        }

        info('Renewing expiring vault entries', { count: expiringSoon.length }, 'vault');

        const { sendSecureUDPMessage } = await import('../server/transport.js');
        const { getContacts } = await import('../../storage/contacts/operations.js');
        const { getMyUPeerId } = await import('../../security/identity.js');
        const allContacts = await getContacts();
        const myId = getMyUPeerId();

        for (const entry of expiringSoon) {
            const newExpiresAt = Date.now() + VAULT_TTL_MS;
            await renewVaultEntry(entry.payloadHash, newExpiresAt);

            const custodians = allContacts
                .filter(contact => contact.status === 'connected'
                    && contact.upeerId !== myId
                    && contact.upeerId !== entry.recipientSid)
                .slice(0, 6);

            for (const custodian of custodians) {
                sendSecureUDPMessage(custodian.address, {
                    type: 'VAULT_RENEW',
                    payloadHash: entry.payloadHash,
                    newExpiresAt,
                });
            }
        }
    } catch (err) {
        warn('Vault renewal cycle failed', { error: err }, 'vault');
    }
}

export async function runLazyVaultMaintenance(
    repairThreshold: number,
    renewExpiring: () => Promise<void>,
    repairAsset: (fileHash: string) => Promise<void>
): Promise<void> {
    debug('Running lazy vault maintenance...', {}, 'vault');

    await renewExpiring();

    try {
        const db = getDb();
        const degradedAssets = await db.select()
            .from(redundancyHealth)
            .where(eq(redundancyHealth.healthStatus, 'degraded'));

        for (const asset of degradedAssets) {
            if (asset.availableShards <= repairThreshold) {
                await repairAsset(asset.assetHash);
            }
        }
    } catch (err) {
        warn('Vault maintenance cycle failed', { error: err }, 'vault');
    }
}