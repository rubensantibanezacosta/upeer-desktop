import { BrowserWindow } from 'electron';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { saveFileMessage } from '../../storage/messages/operations.js';
import {
    getMyPublicKeyHex,
    getMyUPeerId,
    verify,
} from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';
import { validateMessage } from '../../security/validation.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { debug, security, warn, error } from '../../security/secure-logger.js';
import { fileTransferManager } from '../file-transfer/transfer-manager.js';
import { verifyFileTransferPacketSignature } from '../file-transfer/signature.js';
import { saveVaultEntry } from '../../storage/vault/operations.js';
import { trackDistributedAsset } from '../../storage/vault/asset-operations.js';
import { SHARD_TTL_MS } from '../vault/manager.js';
import { completeVaultRecoverySource, touchVaultRecoverySource } from '../vault/recoveryTracker.js';

type VaultSendResponse = (ip: string, data: Record<string, unknown>) => void;

type VaultEntry = {
    senderSid: string;
    payloadHash?: string;
    data: string;
};

type VaultDeliveryPayload = {
    entries?: unknown;
    hasMore?: unknown;
    nextOffset?: unknown;
    nextAfterId?: unknown;
};

type VaultOriginContact = {
    upeerId: string;
    publicKey: string;
};

type VaultInnerPacket = {
    type?: string;
    signature?: string;
    senderUpeerId?: string;
    isInternalSync?: boolean;
    fileHash?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    payloadHash?: string;
    [key: string]: unknown;
};

const pendingVaultFileCustodians = new Map<string, Map<string, Set<string>>>();
const vouchedVaultFiles = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isVaultEntry(value: unknown): value is VaultEntry {
    return isRecord(value) && typeof value.senderSid === 'string' && typeof value.data === 'string';
}

export async function handleVaultDelivery(
    senderSid: string,
    data: VaultDeliveryPayload,
    win: BrowserWindow | null,
    sendResponse: VaultSendResponse,
    fromAddress: string
) {
    const recoverySourceKey = typeof fromAddress === 'string' && fromAddress.length > 0 ? fromAddress : senderSid;
    const activeVaultFiles = pendingVaultFileCustodians.get(recoverySourceKey);

    // BUG AJ fix: custodio malicioso podría enviar data.entries = null o un array
    // de 100 000 entradas, reventando el for-of o saturando CPU/mem en el loop.
    // Validar tipo y aplicar límite duro antes de iterar.
    if (!Array.isArray(data.entries)) {
        if (activeVaultFiles) {
            pendingVaultFileCustodians.delete(recoverySourceKey);
        }
        completeVaultRecoverySource(recoverySourceKey);
        security('VAULT_DELIVERY: entries no es un array', { from: senderSid }, 'vault');
        return;
    }
    const MAX_DELIVERY_ENTRIES = 120; // alineado con VAULT_DELIVERY_PAGE_SIZE del custodio
    const entries = data.entries.slice(0, MAX_DELIVERY_ENTRIES).filter(isVaultEntry);

    touchVaultRecoverySource(recoverySourceKey, senderSid);

    let sourceVaultFiles = activeVaultFiles;
    if (!sourceVaultFiles) {
        sourceVaultFiles = new Map<string, Set<string>>();
        pendingVaultFileCustodians.set(recoverySourceKey, sourceVaultFiles);
    }

    debug('Handling vault delivery', { count: entries.length, from: senderSid }, 'vault');

    // Solo ACK-ar entradas que pasaron integridad y fueron procesadas sin error.
    // Entradas corrompidas o manipuladas NO se ACKên → el custodio las conserva.
    let processedEntries = 0;
    const processedAckHashes = new Set<string>();
    let reportedIntegrityFailure = false;
    // Shards recibidos en este batch → se dispara el recovery una sola vez por archivo
    // al final del batch (en lugar de por cada shard), evitando escaneos O(N²) en la DB.
    const recoveredFileHashes = new Set<string>();
    try {
        for (const entry of entries) {
            try {
                const isOwnVaultEntry = entry.senderSid === getMyUPeerId();
                const originalContact = (await getContactByUpeerId(entry.senderSid) as VaultOriginContact | null) || (isOwnVaultEntry
                    ? { upeerId: entry.senderSid, publicKey: getMyPublicKeyHex() }
                    : null);
                if (!originalContact) {
                    warn('Vault entry from unknown original sender', { senderSid: entry.senderSid }, 'vault');
                    continue;
                }

                let innerPacket: VaultInnerPacket | null = null;
                try {
                    const parsed = JSON.parse(Buffer.from(entry.data, 'hex').toString());
                    innerPacket = isRecord(parsed) ? parsed as VaultInnerPacket : null;
                } catch (e) {
                    // Not a JSON packet, likely a raw shard
                }

                // If it's a signed inner packet (CHAT, FILE_DATA_SMALL, etc.)
                if (innerPacket && typeof innerPacket.signature === 'string') {
                    const { signature: innerSig, senderUpeerId: _senderUpeerId, isInternalSync: _isInternalSync, ...innerData } = innerPacket;
                    const isFileTransferPacket = innerPacket.type === 'FILE_DATA_SMALL'
                        || (typeof innerPacket.type === 'string' && innerPacket.type.startsWith('FILE_'));

                    // End-to-end integrity verification must mirror the packet family.
                    // isInternalSync se marca al entregar para self-sync, pero la firma del
                    // emisor NO lo incluye: se excluye del innerData verificado y se añade
                    // al packet solo después de validar la integridad.
                    // GROUP_MSG se firma sobre el packet COMPLETO (incluye senderUpeerId),
                    // a diferencia del resto (CHAT, mutaciones) que firman sin senderUpeerId.
                    // Por tanto se verifica excluyendo solo signature/isInternalSync pero
                    // conservando senderUpeerId en los datos verificados.
                    let verifiedData: Record<string, unknown> = innerData;
                    if (innerPacket.type === 'GROUP_MSG') {
                        const { signature: _sig, isInternalSync: _intSync, ...groupData } = innerPacket;
                        verifiedData = groupData;
                    }
                    const verificationPayloads = innerPacket.type === 'GROUP_MSG'
                        ? [verifiedData]
                        : [
                            verifiedData,
                            ...(typeof innerPacket.senderUpeerId === 'string' && innerPacket.senderUpeerId === entry.senderSid
                                ? [{ ...verifiedData, senderUpeerId: innerPacket.senderUpeerId }]
                                : []),
                        ];
                    const isInnerValid = isFileTransferPacket
                        ? verifyFileTransferPacketSignature(innerPacket, originalContact.publicKey)
                        : verificationPayloads.some((payload) => verify(
                            Buffer.from(canonicalStringify(payload)),
                            Buffer.from(innerSig, 'hex'),
                            Buffer.from(originalContact.publicKey, 'hex')
                        ));

                    if (!isInnerValid) {
                        security('Vault delivery integrity failure!', { originalSender: entry.senderSid, custodian: senderSid }, 'vault');
                        if (!reportedIntegrityFailure) {
                            reportedIntegrityFailure = true;
                            issueVouch(senderSid, VouchType.INTEGRITY_FAIL).catch((err) => {
                                warn('Failed to issue integrity failure vouch', { senderSid, err: String(err) }, 'reputation');
                            });
                        }
                        continue;
                    }
                    if (isOwnVaultEntry) {
                        innerPacket.isInternalSync = true;
                    }

                    // BUG FK fix: los inner packets de vault delivery saltaban validateMessage().
                    // Ed25519 garantiza autenticidad pero no validez estructural de los campos.
                    // Un contacto comprometido puede firmar un packet malformado que crashe handlers.
                    // Se valida aquí para los tipos que tienen validador; FILE_* y FILE_DATA_SMALL
                    // gestionan su propia validación en sus respectivos handlers.
                    const _vaultTypes = ['CHAT', 'GROUP_MSG', 'CHAT_UPDATE', 'CHAT_DELETE', 'CHAT_CLEAR_ALL', 'GROUP_INVITE', 'GROUP_UPDATE', 'GROUP_LEAVE', 'ACK', 'READ', 'CHAT_REACTION'];
                    if (typeof innerPacket.type === 'string' && _vaultTypes.includes(innerPacket.type)) {
                        const _innerValidation = validateMessage(innerPacket.type, innerPacket);
                        if (!_innerValidation.valid) {
                            security('Vault inner packet failed structural validation', { type: innerPacket.type, error: _innerValidation.error, sender: entry.senderSid }, 'vault');
                            continue;
                        }
                    }

                    // Import handlers dynamically to avoid circular dependencies
                    if (innerPacket.type === 'CHAT') {
                        const { handleChatMessage } = await import('./chat.js');
                        await handleChatMessage(entry.senderSid, originalContact, innerPacket as unknown as Parameters<typeof handleChatMessage>[2], win, innerSig, fromAddress, sendResponse);
                    } else if (innerPacket.type === 'CHAT_CLEAR_ALL') {
                        const { handleChatClear } = await import('./chat.js');
                        await handleChatClear(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'CHAT_UPDATE') {
                        const { handleChatEdit } = await import('./chat.js');
                        await handleChatEdit(entry.senderSid, innerPacket, win, innerSig);
                    } else if (innerPacket.type === 'FILE_DATA_SMALL') {
                        if (typeof innerPacket.fileHash !== 'string' || !/^[0-9a-f]{64}$/i.test(innerPacket.fileHash)) {
                            security('Vault FILE_DATA_SMALL: fileHash inválido', { sender: entry.senderSid }, 'vault');
                            continue;
                        }
                        await saveFileMessage(
                            innerPacket.fileHash,
                            entry.senderSid,
                            false,
                            innerPacket.fileName || 'file',
                            innerPacket.fileHash,
                            innerPacket.fileSize || 0,
                            innerPacket.mimeType || 'application/octet-stream',
                            undefined,
                            undefined,
                            'delivered'
                        );
                    } else if (typeof innerPacket.type === 'string' && innerPacket.type.startsWith('FILE_')) {
                        if (innerPacket.type === 'FILE_PROPOSAL') {
                            debug('Vault delivery: processing FILE_PROPOSAL', {
                                fileId: innerPacket.fileId,
                                fileHash: innerPacket.fileHash,
                                fileName: innerPacket.fileName,
                                from: entry.senderSid
                            }, 'vault');
                        }
                        await fileTransferManager.handleMessage(entry.senderSid, fromAddress, innerPacket as unknown as Parameters<typeof fileTransferManager.handleMessage>[2]);
                        if (innerPacket.type === 'FILE_PROPOSAL' && typeof innerPacket.fileHash === 'string') {
                            await fileTransferManager.tryRecoverVaultTransferByFileHash(innerPacket.fileHash);
                        }
                    } else if (innerPacket.type === 'GROUP_MSG') {
                        const { handleGroupMessage } = await import('./groups.js');
                        await handleGroupMessage(entry.senderSid, { name: entry.senderSid.slice(0, 8) }, innerPacket as unknown as Parameters<typeof handleGroupMessage>[2], win);
                    } else if (innerPacket.type === 'CHAT_DELETE') {
                        const { handleChatDelete } = await import('./chat.js');
                        await handleChatDelete(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'ACK') {
                        const { handleChatAck } = await import('./chat.js');
                        await handleChatAck(entry.senderSid, innerPacket as unknown as Parameters<typeof handleChatAck>[1], win);
                    } else if (innerPacket.type === 'READ') {
                        const { handleChatAck } = await import('./chat.js');
                        await handleChatAck(entry.senderSid, { ...innerPacket, status: 'read' } as unknown as Parameters<typeof handleChatAck>[1], win);
                    } else if (innerPacket.type === 'GROUP_INVITE') {
                        const { handleGroupInvite } = await import('./groups.js');
                        await handleGroupInvite(entry.senderSid, innerPacket as unknown as Parameters<typeof handleGroupInvite>[1], win, fromAddress, sendResponse);
                    } else if (innerPacket.type === 'GROUP_UPDATE') {
                        const { handleGroupUpdate } = await import('./groups.js');
                        await handleGroupUpdate(entry.senderSid, innerPacket as unknown as Parameters<typeof handleGroupUpdate>[1], win, fromAddress, sendResponse);
                    } else if (innerPacket.type === 'GROUP_LEAVE') {
                        const { handleGroupLeave } = await import('./groups.js');
                        await handleGroupLeave(entry.senderSid, innerPacket as unknown as Parameters<typeof handleGroupLeave>[1], win);
                    } else if (innerPacket.type === 'CHAT_REACTION') {
                        const { handleChatReaction } = await import('./chat.js');
                        await handleChatReaction(entry.senderSid, innerPacket, win);
                    }
                } else {
                    // Raw Data / Shards
                    if (typeof entry.payloadHash === 'string' && entry.payloadHash.startsWith('shard:')) {
                        debug('Received file shard from vault', { cid: entry.payloadHash }, 'vault');
                        // For shards, we store them as assets. 
                        // Format can be legacy (shard:hash:idx) or segmented (shard:hash:seg:idx)
                        const parts = entry.payloadHash.split(':');
                        const fileHash = parts[1];
                        const segmentIndex = parts.length === 4 ? parseInt(parts[2], 10) : 0;
                        const shardIndex = parseInt(parts.length === 4 ? parts[3] : parts[2], 10);

                        if (fileHash && !isNaN(shardIndex) && !isNaN(segmentIndex)) {
                            const myId = getMyUPeerId();
                            await saveVaultEntry(
                                entry.payloadHash,
                                myId,
                                entry.senderSid,
                                3,
                                entry.data,
                                Date.now() + SHARD_TTL_MS
                            );
                            await trackDistributedAsset(fileHash, entry.payloadHash, shardIndex, 12, myId, segmentIndex);
                            const custodians = sourceVaultFiles.get(fileHash) ?? new Set<string>();
                            custodians.add(senderSid);
                            sourceVaultFiles.set(fileHash, custodians);
                            recoveredFileHashes.add(fileHash);
                        }
                    }
                }
                // Llegamos aquí sin 'continue' ni excepción → entrada procesada correctamente.
                if (typeof entry.payloadHash !== 'string' || !entry.payloadHash.startsWith('shard:')) {
                    processedEntries += 1;
                }
                // Usar payloadHash si existe, o calcular hash del data como fallback.
                // Esto asegura que incluso entradas sin payloadHash explícito (como CHAT
                // packets) reciban ACK y no sean retransmitidas infinitamente por el custodio.
                const ackHash = typeof entry.payloadHash === 'string' && entry.payloadHash.length > 0
                    ? entry.payloadHash
                    : (typeof entry.data === 'string' ? entry.data.slice(0, 64) : '');
                if (ackHash.length > 0) {
                    processedAckHashes.add(ackHash);
                }
            } catch (err) {
                error('Failed to process delivered vault entry', err, 'vault');
            }
        }
    } catch (err) {
        error('Vault delivery processing failed', err, 'vault');
    }

    // Disparar el recovery de archivos vaulteados una vez por archivo tras procesar
    // todo el batch de shards, en lugar de hacerlo por cada shard individual.
    if (recoveredFileHashes.size > 0) {
        for (const fileHash of recoveredFileHashes) {
            try {
                await fileTransferManager.tryRecoverVaultTransferByFileHash(fileHash);
            } catch (err) {
                warn('Vault transfer recovery failed', { fileHash, err: String(err) }, 'vault');
            }
        }
    }

    if (processedEntries > 0) {
        issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch((err) => {
            warn('Failed to issue vault retrieved vouch', { senderSid, err: String(err) }, 'reputation');
        });
    }

    if (processedAckHashes.size > 0) {
        sendResponse(fromAddress, {
            type: 'VAULT_ACK',
            payloadHashes: Array.from(processedAckHashes),
        });
    }

    // BUG O fix: si el custodio indicó que hay más entradas, solicitamos la siguiente página.
    // Sin esto, usuarios con >50 mensajes en vault solo reciben los primeros 50 y el resto
    // queda atrapado en el custodio para siempre.
    if (data.hasMore === true && typeof data.nextAfterId === 'number') {
        const myId = getMyUPeerId();
        sendResponse(fromAddress, {
            type: 'VAULT_QUERY',
            requesterSid: myId,
            afterId: data.nextAfterId,
        });
        touchVaultRecoverySource(recoverySourceKey, senderSid);
        debug('Vault delivery: requesting next page', { afterId: data.nextAfterId, from: senderSid }, 'vault');
        return;
    }

    for (const [fileHash, custodians] of sourceVaultFiles) {
        const completedTransfer = fileTransferManager.getAllTransfers().some((transfer) =>
            transfer.direction === 'receiving'
            && transfer.fileHash === fileHash
            && transfer.state === 'completed'
        );
        if (completedTransfer) {
            for (const custodianId of custodians) {
                const vouchKey = `${custodianId}:${fileHash}`;
                if (!vouchedVaultFiles.has(vouchKey)) {
                    vouchedVaultFiles.add(vouchKey);
                    issueVouch(custodianId, VouchType.VAULT_CHUNK).catch((err) => {
                        vouchedVaultFiles.delete(vouchKey);
                        warn('Failed to issue completed vault file vouch', { custodianId, fileHash, err: String(err) }, 'reputation');
                    });
                }
            }
        }
    }
    pendingVaultFileCustodians.delete(recoverySourceKey);

    completeVaultRecoverySource(recoverySourceKey);
}