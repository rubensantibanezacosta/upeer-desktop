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

export async function handleVaultDelivery(
    senderSid: string,
    data: any,
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void,
    fromAddress: string
) {
    // BUG AJ fix: custodio malicioso podría enviar data.entries = null o un array
    // de 100 000 entradas, reventando el for-of o saturando CPU/mem en el loop.
    // Validar tipo y aplicar límite duro antes de iterar.
    if (!Array.isArray(data.entries)) {
        security('VAULT_DELIVERY: entries no es un array', { from: senderSid }, 'vault');
        return;
    }
    const MAX_DELIVERY_ENTRIES = 50; // igual que la paginación del custodio
    const entries = data.entries.slice(0, MAX_DELIVERY_ENTRIES);

    debug('Handling vault delivery', { count: entries.length, from: senderSid }, 'vault');

    issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch((err) => {
        warn('Failed to issue vault retrieved vouch', { senderSid, err: String(err) }, 'reputation');
    });

    // Solo ACK-ar entradas que pasaron integridad y fueron procesadas sin error.
    // Entradas corrompidas o manipuladas NO se ACKên → el custodio las conserva.
    const validatedHashes: string[] = [];
    try {
        for (const entry of entries) {
            try {
                const isOwnVaultEntry = entry.senderSid === getMyUPeerId();
                const originalContact = await getContactByUpeerId(entry.senderSid) || (isOwnVaultEntry
                    ? { upeerId: entry.senderSid, publicKey: getMyPublicKeyHex() }
                    : null);
                if (!originalContact) {
                    warn('Vault entry from unknown original sender', { senderSid: entry.senderSid }, 'vault');
                    continue;
                }

                let innerPacket: any = null;
                try {
                    innerPacket = JSON.parse(Buffer.from(entry.data, 'hex').toString());
                } catch (e) {
                    // Not a JSON packet, likely a raw shard
                }

                // If it's a signed inner packet (CHAT, FILE_DATA_SMALL, etc.)
                if (innerPacket && innerPacket.signature) {
                    if (isOwnVaultEntry) {
                        innerPacket.isInternalSync = true;
                    }
                    const { signature: innerSig, senderUpeerId: _senderUpeerId, ...innerData } = innerPacket;

                    // End-to-End Integrity Verification
                    const isInnerValid = originalContact.publicKey && verify(
                        Buffer.from(canonicalStringify(innerData)),
                        Buffer.from(innerSig, 'hex'),
                        Buffer.from(originalContact.publicKey, 'hex')
                    );

                    if (!isInnerValid) {
                        security('Vault delivery integrity failure!', { originalSender: entry.senderSid, custodian: senderSid }, 'vault');
                        issueVouch(senderSid, VouchType.INTEGRITY_FAIL).catch((err) => {
                            warn('Failed to issue integrity failure vouch', { senderSid, err: String(err) }, 'reputation');
                        });
                        continue;
                    }

                    // BUG FK fix: los inner packets de vault delivery saltaban validateMessage().
                    // Ed25519 garantiza autenticidad pero no validez estructural de los campos.
                    // Un contacto comprometido puede firmar un packet malformado que crashe handlers.
                    // Se valida aquí para los tipos que tienen validador; FILE_* y FILE_DATA_SMALL
                    // gestionan su propia validación en sus respectivos handlers.
                    const _vaultTypes = ['CHAT', 'GROUP_MSG', 'CHAT_UPDATE', 'CHAT_DELETE', 'CHAT_CLEAR_ALL', 'GROUP_INVITE', 'GROUP_UPDATE', 'GROUP_LEAVE', 'ACK', 'READ', 'CHAT_REACTION'];
                    if (_vaultTypes.includes(innerPacket.type)) {
                        const _innerValidation = validateMessage(innerPacket.type, innerPacket);
                        if (!_innerValidation.valid) {
                            security('Vault inner packet failed structural validation', { type: innerPacket.type, error: _innerValidation.error, sender: entry.senderSid }, 'vault');
                            continue;
                        }
                    }

                    // Import handlers dynamically to avoid circular dependencies
                    if (innerPacket.type === 'CHAT') {
                        const { handleChatMessage } = await import('./chat.js');
                        await handleChatMessage(entry.senderSid, originalContact, innerPacket, win, innerSig, fromAddress, sendResponse);
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
                            'delivered'
                        );
                    } else if (innerPacket?.type?.startsWith('FILE_')) {
                        fileTransferManager.handleMessage(entry.senderSid, fromAddress, innerPacket);
                    } else if (innerPacket?.type === 'GROUP_MSG') {
                        const { handleGroupMessage } = await import('./groups.js');
                        await handleGroupMessage(entry.senderSid, originalContact, innerPacket, win);
                    } else if (innerPacket.type === 'CHAT_DELETE') {
                        const { handleChatDelete } = await import('./chat.js');
                        await handleChatDelete(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'ACK') {
                        const { handleChatAck } = await import('./chat.js');
                        await handleChatAck(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'READ') {
                        const { handleChatAck } = await import('./chat.js');
                        await handleChatAck(entry.senderSid, { ...innerPacket, status: 'read' }, win);
                    } else if (innerPacket.type === 'GROUP_INVITE') {
                        const { handleGroupInvite } = await import('./groups.js');
                        await handleGroupInvite(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'GROUP_UPDATE') {
                        const { handleGroupUpdate } = await import('./groups.js');
                        await handleGroupUpdate(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'GROUP_LEAVE') {
                        const { handleGroupLeave } = await import('./groups.js');
                        await handleGroupLeave(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'CHAT_REACTION') {
                        const { handleChatReaction } = await import('./chat.js');
                        await handleChatReaction(entry.senderSid, innerPacket, win);
                    }
                } else {
                    // Raw Data / Shards
                    if (entry.payloadHash.startsWith('shard:')) {
                        debug('Received file shard from vault', { cid: entry.payloadHash }, 'vault');
                        issueVouch(senderSid, VouchType.VAULT_CHUNK).catch((err) => {
                            warn('Failed to issue vault chunk vouch', { senderSid, err: String(err) }, 'reputation');
                        });

                        // For shards, we store them as assets. 
                        // Format can be legacy (shard:hash:idx) or segmented (shard:hash:seg:idx)
                        const parts = entry.payloadHash.split(':');
                        const fileHash = parts[1];
                        let shardIndex = 0;

                        if (parts.length === 4) {
                            shardIndex = parseInt(parts[3]);
                        } else {
                            shardIndex = parseInt(parts[2]);
                        }

                        if (fileHash && !isNaN(shardIndex)) {
                            await saveFileMessage(
                                fileHash,
                                entry.senderSid,
                                false,
                                fileHash, // Usamos hash como nombre temporal si no viene
                                fileHash,
                                0, // Tamaño desconocido para shard individual
                                'application/octet-stream',
                                undefined,
                                'delivered'
                            );
                        }
                    }
                }
                // Llegamos aquí sin 'continue' ni excepción → entrada procesada correctamente.
                validatedHashes.push(entry.payloadHash);
            } catch (err) {
                error('Failed to process delivered vault entry', err, 'vault');
            }
        }
    } catch (err) {
        error('Vault delivery processing failed', err, 'vault');
    }

    // ACK solo para entradas que pasaron integridad y fueron procesadas sin error.
    // Entradas con firma inválida o que lanzaron excepción NO se ACKên.
    if (validatedHashes.length > 0) {
        sendResponse(fromAddress, {
            type: 'VAULT_ACK',
            payloadHashes: validatedHashes
        });
    }

    // BUG O fix: si el custodio indicó que hay más entradas, solicitamos la siguiente página.
    // Sin esto, usuarios con >50 mensajes en vault solo reciben los primeros 50 y el resto
    // queda atrapado en el custodio para siempre.
    if (data.hasMore === true && typeof data.nextOffset === 'number') {
        const myId = getMyUPeerId();
        sendResponse(fromAddress, {
            type: 'VAULT_QUERY',
            requesterSid: myId,
            offset: data.nextOffset,
        });
        debug('Vault delivery: requesting next page', { offset: data.nextOffset, from: senderSid }, 'vault');
    }
}