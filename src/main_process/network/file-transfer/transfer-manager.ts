import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { FileTransfer, TransferPhase, DEFAULT_CONFIG, TransferConfig } from './types.js';
import { FileTransferStore } from './transfer-store.js';
import { FileChunker } from './chunker.js';
import { TransferValidator } from './validator.js';
import { info, warn, error, debug } from '../../security/secure-logger.js';
import { getMyUPeerId, encrypt, decrypt } from '../../security/identity.js';
import { saveFileMessage, getContactByUpeerId, updateMessageStatus } from '../../storage/db.js';

// ── Per-transfer AES-256-GCM helpers ──────────────────────────────────────────

function generateTransferKey(): Buffer {
    return crypto.randomBytes(32); // AES-256 key
}

function encryptChunk(chunk: Buffer, key: Buffer): { data: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(chunk), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { data: enc.toString('base64'), iv: iv.toString('hex'), tag: tag.toString('hex') };
}

function decryptChunk(data: string, iv: string, tag: string, key: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
}

export class TransferManager {
    private store: FileTransferStore;
    private chunker: FileChunker;
    private validator: TransferValidator;
    private config: TransferConfig;
    private sendFunction?: (address: string, data: any) => void;
    private window?: BrowserWindow | null;
    private fileHandles = new Map<string, any>(); // fileId -> fs.FileHandle
    /** AES-256 keys per transfer (sender generates, receiver decrypts via NaCl box) */
    private transferKeys = new Map<string, Buffer>(); // fileId -> AES key
    // BUG BV fix: timers guardados en un Map propio, NO como propiedad del transfer.
    // store.updateTransfer hace spread y crea objetos nuevos, por lo que _retryTimer
    // en el objeto viejo es invisible para handleCancel que lee del store.
    private retryTimers = new Map<string, ReturnType<typeof setTimeout>>(); // fileId -> timer

    constructor(config: Partial<TransferConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.store = new FileTransferStore();
        this.chunker = new FileChunker(this.config.maxChunkSize);
        this.validator = new TransferValidator(this.config.maxFileSize);
    }

    initialize(sendFunction: (address: string, data: any) => void, window: BrowserWindow) {
        this.setSendFunction(sendFunction);
        this.setWindow(window);
    }

    setWindow(window: BrowserWindow) {
        this.window = window;
    }

    setSendFunction(fn: (address: string, data: any) => void) {
        this.sendFunction = fn;
    }

    // --- PUBLIC API ---

    /**
     * Start sending a file to a peer
     */
    async startSend(upeerId: string, address: string, filePath: string, thumbnail?: string): Promise<string> {
        try {
            const fileInfo = await this.validator.validateAndPrepareFile(filePath);
            const totalChunks = this.chunker.calculateChunks(fileInfo.size);

            const transfer = this.store.createTransfer({
                upeerId,
                peerAddress: address,
                fileName: fileInfo.name,
                fileSize: fileInfo.size,
                mimeType: fileInfo.mimeType,
                totalChunks,
                chunkSize: this.config.maxChunkSize,
                fileHash: fileInfo.hash,
                thumbnail,
                direction: 'sending' as const,
                filePath,
                fileBuffer: fileInfo.buffer
            });

            this.store.updateTransfer(transfer.fileId, 'sending', { state: 'active', phase: TransferPhase.PROPOSED });

            // ── E2E encryption: generate AES-256 key and seal it for the peer ──
            const contact = await getContactByUpeerId(upeerId);
            const peerKey = contact?.ephemeralPublicKey || contact?.publicKey;
            let encryptedKey: string | undefined;
            let encryptedKeyNonce: string | undefined;
            let useEphemeral = false;

            if (peerKey) {
                const aesKey = generateTransferKey();
                this.transferKeys.set(transfer.fileId, aesKey);
                useEphemeral = !!contact?.ephemeralPublicKey;
                const sealed = encrypt(aesKey, Buffer.from(peerKey, 'hex'), useEphemeral);
                encryptedKey = sealed.ciphertext.toString('hex');
                encryptedKeyNonce = sealed.nonce.toString('hex');
            }

            // Encrypt thumbnail if present
            let encThumb: { data: string; iv: string; tag: string } | undefined;
            const aesKey = this.transferKeys.get(transfer.fileId);
            if (thumbnail && aesKey) {
                encThumb = encryptChunk(Buffer.from(thumbnail.replace(/^data:[^;]+;base64,/, ''), 'base64'), aesKey);
            }

            this.send(address, {
                type: 'FILE_PROPOSAL',
                fileId: transfer.fileId,
                fileName: transfer.fileName,
                fileSize: transfer.fileSize,
                mimeType: transfer.mimeType,
                totalChunks: transfer.totalChunks,
                chunkSize: transfer.chunkSize,
                fileHash: transfer.fileHash,
                // E2E sealed key
                ...(encryptedKey ? { encryptedKey, encryptedKeyNonce, useRecipientEphemeral: useEphemeral } : {}),
                // Encrypted thumbnail (optional)
                ...(encThumb ? { thumbnail: encThumb } : {}),
            });

            this.notifyUIStarted(transfer);
            await this.saveToDB(transfer);

            // 200% resilience: vault the encrypted proposal + file shards
            // so an offline recipient can receive the transfer when they reconnect
            if (aesKey) {
                // ── Vault: siempre sellar AES key con clave ESTÁTICA ──────────
                // El paquete online puede usar ephemeral (que rotará en 5 min).
                // Para vault usamos solo la clave estática para garantizar que el
                // peer puede descifrar la AES key tras volver online en cualquier momento.
                const staticPeerKey = contact?.publicKey;
                let vaultEncKey: string | undefined;
                let vaultEncKeyNonce: string | undefined;

                if (staticPeerKey && aesKey) {
                    const { encrypt: encStatic } = await import('../../security/identity.js');
                    const vaultSealed = encStatic(aesKey, Buffer.from(staticPeerKey, 'hex'), false);
                    vaultEncKey = vaultSealed.ciphertext.toString('hex');
                    vaultEncKeyNonce = vaultSealed.nonce.toString('hex');
                }

                // BUG CL fix: senderUpeerId debe quedar FUERA del payload firmado.
                // handleVaultDelivery hace: const { signature, senderUpeerId, ...innerData } = innerPacket
                // y verifica canonicalStringify(innerData). Si senderUpeerId está dentro
                // del bloque firmado, innerData lo omite → mismatch → verificación siempre falla
                // → FILE_PROPOSAL vaultado silenciosamente descartado (igual que CHAT_DELETE/CHAT).
                const proposalData = {
                    type: 'FILE_PROPOSAL',
                    fileId: transfer.fileId,
                    fileName: transfer.fileName,
                    fileSize: transfer.fileSize,
                    mimeType: transfer.mimeType,
                    totalChunks: transfer.totalChunks,
                    chunkSize: transfer.chunkSize,
                    fileHash: transfer.fileHash,
                    // Vault version: AES key cifrada con clave estática (no efímera)
                    ...(vaultEncKey ? { encryptedKey: vaultEncKey, encryptedKeyNonce: vaultEncKeyNonce, useRecipientEphemeral: false } : {}),
                    ...(encThumb ? { thumbnail: encThumb } : {}),
                    // senderUpeerId se añade solo en el wrapper externo (no en datos firmados)
                };
                import('./../../security/identity.js').then(({ sign }) => {
                    import('../utils.js').then(({ canonicalStringify }) => {
                        import('../vault/manager.js').then(({ VaultManager }) => {
                            const sig = sign(Buffer.from(canonicalStringify(proposalData)));
                            VaultManager.replicateToVaults(upeerId, {
                                ...proposalData,
                                senderUpeerId: getMyUPeerId(),
                                signature: sig.toString('hex')
                            }).then((nodes) => {
                                if (nodes > 0) {
                                    updateMessageStatus(transfer.fileId, 'vaulted' as any);
                                    this.window?.webContents.send('message-status-updated', {
                                        id: transfer.fileId,
                                        status: 'vaulted'
                                    });
                                }
                            });
                        });
                    });
                }).catch(err => warn('Failed to vault file proposal', err, 'vault'));

                if (transfer.fileBuffer) {
                    const encryptedBuffer = this._encryptBuffer(transfer.fileBuffer, aesKey);

                    // Mark as replicating in background
                    this.store.updateTransfer(transfer.fileId, 'sending', { phase: TransferPhase.REPLICATING });

                    import('../vault/chunk-vault.js').then(({ ChunkVault }) => {
                        ChunkVault.replicateFile(transfer.fileHash, encryptedBuffer, upeerId, transfer.fileId);
                    }).catch(err => warn('Failed to initiate background file replication', err, 'vault'));
                }
            }

            return transfer.fileId;

        } catch (err) {
            error('Error starting file transfer', err, 'file-transfer');
            throw err;
        }
    }

    /** AES-256-GCM encrypt a whole buffer (for vault storage) */
    private _encryptBuffer(buf: Buffer, key: Buffer): Buffer {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
        const tag = cipher.getAuthTag();
        // Prepend iv(12) + tag(16) so receiver can reconstruct
        return Buffer.concat([iv, tag, enc]);
    }

    /**
     * Cancel a transfer
     */
    cancelTransfer(fileId: string, reason = 'Cancelled by user') {
        const directions: ('sending' | 'receiving')[] = ['sending', 'receiving'];
        directions.forEach(dir => {
            const transfer = this.store.getTransfer(fileId, dir);
            if (transfer && transfer.state === 'active') {
                this.store.updateTransfer(fileId, dir, { state: 'cancelled' });
                // Notify peer
                this.send(transfer.peerAddress, { type: 'FILE_CANCEL', fileId, reason });
                this.notifyUICancelled(transfer, reason);

                // Close handles if any
                const handle = this.fileHandles.get(fileId);
                if (handle) {
                    handle.close().catch((err: any) => warn('Failed to close file handle', err, 'file-transfer'));
                    this.fileHandles.delete(fileId);
                }
                // BUG EV fix: borrar archivo temporal del receptor al cancelar.
                // Sin esto, los archivos en /tmp/upeer-* se acumulan indefinidamente.
                if (dir === 'receiving') {
                    this.chunker.cleanupTempFile(transfer).catch((err: any) => warn('Failed to cleanup temp file', err, 'file-transfer'));
                }
                // BUG BC fix: limpiar la clave AES-256 de memoria para evitar
                // que el material criptográfico se acumule indefinidamente.
                // (moved outside loop)
            }
        });

        // Clean up retry timer
        const timer = this.retryTimers.get(fileId);
        if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(fileId);
        }
        // Clean up transfer key (once)
        this.transferKeys.delete(fileId);
    }

    // --- MESSAGE HANDLERS ---

    async handleMessage(upeerId: string, address: string, data: any) {
        switch (data.type) {
            case 'FILE_PROPOSAL':
                await this.handleProposal(upeerId, address, data);
                break;
            case 'FILE_ACCEPT':
                await this.handleAccept(upeerId, address, data);
                break;
            case 'FILE_CHUNK':
                await this.handleChunk(upeerId, address, data);
                break;
            case 'FILE_CHUNK_ACK':
                await this.handleChunkAck(upeerId, address, data);
                break;
            case 'FILE_DONE_ACK':
                await this.handleDoneAck(upeerId, address, data);
                break;
            case 'FILE_CANCEL':
                await this.handleCancel(upeerId, address, data);
                break;
        }
    }

    private async handleProposal(upeerId: string, address: string, data: any) {
        try {
            this.validator.validateIncomingFile(data);

            // ── Decrypt the AES key sealed by the sender ──
            if (data.encryptedKey && data.encryptedKeyNonce) {
                try {
                    const senderContact = await getContactByUpeerId(upeerId);
                    const senderKey = senderContact?.publicKey;
                    if (senderKey) {
                        const aesKeyBuf = decrypt(
                            Buffer.from(data.encryptedKey, 'hex'),
                            Buffer.from(data.encryptedKeyNonce, 'hex'),
                            Buffer.from(senderKey, 'hex'),
                            !!data.useRecipientEphemeral
                        );
                        if (aesKeyBuf) this.transferKeys.set(data.fileId, aesKeyBuf);
                    }
                } catch {
                    warn('Could not decrypt file transfer key', { fileId: data.fileId }, 'file-transfer');
                }
            }

            // Decrypt thumbnail if encrypted
            let thumbnail = data.thumbnail;
            const aesKey = this.transferKeys.get(data.fileId);
            if (thumbnail && typeof thumbnail === 'object' && thumbnail.iv && aesKey) {
                try {
                    const raw = decryptChunk(thumbnail.data, thumbnail.iv, thumbnail.tag, aesKey);
                    const mime = data.mimeType?.startsWith('video') ? 'image/jpeg' : (data.mimeType || 'image/jpeg');
                    thumbnail = `data:${mime};base64,${raw.toString('base64')}`;
                } catch { thumbnail = undefined; }
            }

            const transfer = this.store.createTransfer({
                fileId: data.fileId,
                upeerId,
                peerAddress: address,
                fileName: data.fileName,
                fileSize: data.fileSize,
                mimeType: data.mimeType,
                totalChunks: data.totalChunks,
                chunkSize: data.chunkSize,
                fileHash: data.fileHash || '',
                thumbnail,
                direction: 'receiving' as const
            });

            await this.chunker.createTempFile(transfer);

            this.store.updateTransfer(data.fileId, 'receiving', {
                state: 'active',
                phase: TransferPhase.READY,
                tempPath: transfer.tempPath
            });

            this.send(address, { type: 'FILE_ACCEPT', fileId: data.fileId });

            this.notifyUIStarted(transfer);
            await this.saveToDB(transfer);
        } catch (err) {
            error('Error handling file proposal', err, 'file-transfer');
            this.send(address, { type: 'FILE_CANCEL', fileId: data.fileId, reason: 'Rejected by receiver' });
        }
    }

    private async handleAccept(upeerId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'sending');
        if (!transfer || transfer.phase !== TransferPhase.PROPOSED) return;

        const updatedTransfer = this.store.updateTransfer(data.fileId, 'sending', { phase: TransferPhase.TRANSFERRING });

        if (updatedTransfer) this.notifyUIProgress(updatedTransfer);

        // Start sending the first chunks
        this.sendNextChunks(transfer, address);
    }

    private async handleChunk(upeerId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'receiving');
        if (!transfer || transfer.state !== 'active') return;

        // BUG CJ fix: validar chunkIndex antes de usarlo como offset de escritura.
        // Sin esto, un peer malicioso puede enviar chunkIndex < 0 o >= totalChunks,
        // causando escrituras en offsets inválidos o fuera del archivo pre-asignado
        // (disk bomb: el archivo temporal crece indefinidamente).
        if (
            typeof data.chunkIndex !== 'number' ||
            !Number.isInteger(data.chunkIndex) ||
            data.chunkIndex < 0 ||
            data.chunkIndex >= transfer.totalChunks
        ) {
            warn('Invalid chunk index received — dropped', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
            return;
        }

        try {
            // Write using cached handle for extreme performance
            let handle = this.fileHandles.get(transfer.fileId);
            if (!handle && transfer.tempPath) {
                handle = await fs.open(transfer.tempPath, 'r+');
                this.fileHandles.set(transfer.fileId, handle);
            }

            if (handle) {
                // Decrypt chunk if we have an AES key for this transfer
                let buffer: Buffer;
                const aesKey = this.transferKeys.get(data.fileId);
                if (aesKey && data.iv && data.tag) {
                    buffer = decryptChunk(data.data, data.iv, data.tag, aesKey);
                } else {
                    buffer = Buffer.from(data.data, 'base64');
                }
                const offset = data.chunkIndex * transfer.chunkSize;
                await handle.write(buffer, 0, buffer.length, offset);
            }

            // Mark as processed (Update internal tracker)
            transfer.pendingChunks.add(data.chunkIndex);
            const count = transfer.pendingChunks.size;

            const updatedTransfer = this.store.updateTransfer(transfer.fileId, 'receiving', {
                chunksProcessed: count,
                phase: TransferPhase.TRANSFERRING
            });

            // Send ACK
            this.send(address, {
                type: 'FILE_CHUNK_ACK',
                fileId: transfer.fileId,
                chunkIndex: data.chunkIndex
            });

            if (updatedTransfer) this.notifyUIProgress(updatedTransfer);

            // If all chunks received and not already completing, complete
            if (count === transfer.totalChunks && transfer.phase < TransferPhase.VERIFYING) {
                await this.completeReceiver(transfer, address);
            }
        } catch (err) {
            error('Error writing chunk', err, 'file-transfer');
        }
    }

    private async handleChunkAck(upeerId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'sending');
        if (!transfer || transfer.state !== 'active') return;

        // BUG CJ fix: validar chunkIndex en ACKs también.
        // Un índice fuera de rango contamina pendingChunks e impide que el sender
        // detecte correctamente la compleción de la transferencia.
        if (
            typeof data.chunkIndex !== 'number' ||
            !Number.isInteger(data.chunkIndex) ||
            data.chunkIndex < 0 ||
            data.chunkIndex >= transfer.totalChunks
        ) {
            warn('Invalid chunk ACK index — dropped', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
            return;
        }

        debug('FILE_CHUNK ACK received', { chunkIndex: data.chunkIndex, fileId: data.fileId }, 'file-transfer');

        transfer.pendingChunks.add(data.chunkIndex);
        const count = transfer.pendingChunks.size;

        const updatedTransfer = this.store.updateTransfer(transfer.fileId, 'sending', {
            chunksProcessed: count
        });

        if (updatedTransfer) {
            // Adaptive Speed Optimization (Congestion Control)
            const chunksSentTimes = (updatedTransfer as any)._chunksSentTimes as Map<number, number>;
            if (chunksSentTimes && chunksSentTimes.has(data.chunkIndex)) {
                const now = Date.now();
                const sentTime = chunksSentTimes.get(data.chunkIndex);
                if (sentTime === undefined) return;
                const rtt = now - sentTime;

                // Update Smothed RTT and Retransmission Timeout (RTO)
                const currentSrtt = updatedTransfer.srtt || 250;
                const newSrtt = Math.floor(0.8 * currentSrtt + 0.2 * rtt);
                const newRto = Math.max(150, Math.min(3000, newSrtt * 3)); // 3x SRTT for safety, min 150ms

                // Window size update (Simplified TCP Tahoe/Reno style)
                let newWindowSize = updatedTransfer.windowSize || 64;
                const newSsthresh = updatedTransfer.ssthresh || 128;
                let consecutiveAcks = (updatedTransfer.consecutiveAcks || 0) + 1;

                if (newWindowSize < newSsthresh) {
                    // Slow Start: Exponential increase (doubling window every full window of ACKs)
                    // We simplify: increment every ACK
                    newWindowSize += 1;
                } else {
                    // Congestion Avoidance: Linear increase
                    if (consecutiveAcks >= Math.floor(newWindowSize)) {
                        newWindowSize += 1;
                        consecutiveAcks = 0;
                    }
                }

                // Caps
                newWindowSize = Math.min(newWindowSize, 2000);

                this.store.updateTransfer(data.fileId, 'sending', {
                    srtt: newSrtt,
                    rto: newRto,
                    windowSize: newWindowSize,
                    ssthresh: newSsthresh,
                    consecutiveAcks
                });
            }

            this.notifyUIProgress(updatedTransfer);
        }

        if (!updatedTransfer) return;

        if (count === transfer.totalChunks && updatedTransfer.phase < TransferPhase.COMPLETING) {
            // Done sending
            const updated = this.store.updateTransfer(transfer.fileId, 'sending', { phase: TransferPhase.COMPLETING });
            if (updated) this.notifyUIProgress(updated);
        } else if (count < transfer.totalChunks) {
            this.sendNextChunks(updatedTransfer, address);
        }
    }

    private async handleDoneAck(upeerId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'sending');
        if (!transfer || transfer.state === 'completed') return;

        // BUG BV fix: limpiar retry timer al completar la transferencia.
        const timer = this.retryTimers.get(data.fileId);
        if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(data.fileId);
        }

        const updated = this.store.updateTransfer(transfer.fileId, 'sending', {
            state: 'completed',
            phase: TransferPhase.DONE
        });

        if (updated) {
            await this.saveToDB(updated);
            this.notifyUIProgress(updated);
            this.notifyUICompleted(updated);
            // Also notify that the message is now delivered
            this.window?.webContents.send('message-delivered', {
                id: updated.fileId, // We use fileId as messageId
                upeerId: updated.upeerId
            });
        }
    }

    private async handleCancel(upeerId: string, address: string, data: any) {
        // Cancel both directions if they exist (could be self transfer)
        // Bug FB fix: forEach(async) no propaga errores; usar for...of para que las
        // excepciones síncronas dentro del bloque se conviertan en rechazos que
        // handleCancel (async) puede capturar en lugar de quedar sin manejo.
        for (const dir of ['sending', 'receiving'] as const) {
            const transfer = this.store.getTransfer(data.fileId, dir);
            if (transfer) {
                // BUG BV fix: limpiar timer desde el Map centralizado, no del objeto transfer.
                const timer = this.retryTimers.get(data.fileId);
                if (timer) {
                    clearTimeout(timer);
                    this.retryTimers.delete(data.fileId);
                }

                // Close and remove file handle
                const handle = this.fileHandles.get(data.fileId);
                if (handle) {
                    await handle.close().catch((err: any) => warn('Failed to close file handle', err, 'file-transfer'));
                    this.fileHandles.delete(data.fileId);
                }
                // BUG EV fix: borrar archivo temporal del receptor al recibir cancel remoto.
                if (dir === 'receiving') {
                    await this.chunker.cleanupTempFile(transfer).catch(() => { });
                }
                // BUG BC fix: liberar clave AES-256 al cancelar (evita key-material leak).
                this.transferKeys.delete(data.fileId);

                this.store.updateTransfer(transfer.fileId, dir, { state: 'cancelled' });
                this.notifyUICancelled(transfer, data.reason);
                await this.saveToDB({ ...transfer, state: 'cancelled' } as any);
            }
        }
    }

    // --- INTERNAL HELPERS ---

    private async sendNextChunks(transfer: FileTransfer, address: string) {
        // Tracker de tiempos de envío para retransmisiones
        const chunksSentTimes = (transfer as any)._chunksSentTimes || new Map<number, number>();
        (transfer as any)._chunksSentTimes = chunksSentTimes;

        const maxInFlight = Math.floor(transfer.windowSize || 64);
        const now = Date.now();
        const retryTimeout = transfer.rto || 500;

        // Contar cuántos están "en vuelo" (enviados pero no confirmados por ACK)
        let inFlight = 0;
        let needsRetransmission = false;

        for (const [chunkIndex, sentAt] of chunksSentTimes.entries()) {
            if (!transfer.pendingChunks.has(chunkIndex)) {
                if (now - sentAt < retryTimeout) {
                    inFlight++;
                } else {
                    needsRetransmission = true;
                }
            } else {
                // Limpiar de nuestro mapa si ya fue validado
                chunksSentTimes.delete(chunkIndex);
            }
        }

        // Si detectamos pérdida (retransmisión necesaria), reducimos ventana (Congestion Event)
        if (needsRetransmission) {
            const currentWindow = transfer.windowSize || 20;
            const newSsthresh = Math.max(2, Math.floor(currentWindow / 2));
            debug('FILE transfer congestion detected', { window: currentWindow, newSsthresh, rto: retryTimeout }, 'file-transfer');
            this.store.updateTransfer(transfer.fileId, 'sending', {
                windowSize: 2, // Volver a slow-start agresivo tras pérdida
                ssthresh: newSsthresh,
                consecutiveAcks: 0
            });
        }

        // Si la ventana está llena, NO podemos enviar chunks nuevos pero SÍ podemos retransmitir
        // chunks que hayan alcanzado su timeout. Por tanto, NO hacemos return.

        // Limit number of retransmissions per call to avoid bursts
        let retransmissionsCount = 0;
        const maxRetransmissionsPerCall = 10;

        // 1. Check for retransmissions first (Prioritize lost chunks)
        for (const [chunkIndex, sentAt] of chunksSentTimes.entries()) {
            if (!transfer.pendingChunks.has(chunkIndex)) {
                if (now - sentAt >= retryTimeout) {
                    if (retransmissionsCount < maxRetransmissionsPerCall) {
                        chunksSentTimes.set(chunkIndex, now);
                        const chunkData = await this.chunker.createChunkData(transfer, chunkIndex);
                        debug('Retransmitting chunk', { chunkIndex, fileId: transfer.fileId }, 'file-transfer');
                        const aesKeyR = this.transferKeys.get(transfer.fileId);
                        const encR = aesKeyR
                            ? encryptChunk(Buffer.from(chunkData.data, 'base64'), aesKeyR)
                            : { data: chunkData.data, iv: undefined, tag: undefined };
                        this.send(address, { type: 'FILE_CHUNK', ...chunkData, ...encR });
                        retransmissionsCount++;
                    }
                }
            }
        }

        // 2. Send new chunks starting from nextChunkIndex
        let chunksAdded = 0;
        let currentIndex = transfer.nextChunkIndex || 0;

        while (currentIndex < transfer.totalChunks && inFlight + chunksAdded < maxInFlight) {
            if (!transfer.pendingChunks.has(currentIndex)) {
                if (!chunksSentTimes.has(currentIndex)) {
                    // Pre-emptively mark as sent/in-flight before the await to avoid race conditions
                    chunksSentTimes.set(currentIndex, now);
                    chunksAdded++;

                    // Update nextChunkIndex in store immediately
                    this.store.updateTransfer(transfer.fileId, 'sending', {
                        nextChunkIndex: currentIndex + 1
                    });

                    const chunkData = await this.chunker.createChunkData(transfer, currentIndex);
                    debug('Sending chunk', { chunkIndex: currentIndex, total: transfer.totalChunks, window: maxInFlight }, 'file-transfer');
                    const aesKey = this.transferKeys.get(transfer.fileId);
                    const enc = aesKey
                        ? encryptChunk(Buffer.from(chunkData.data, 'base64'), aesKey)
                        : { data: chunkData.data, iv: undefined, tag: undefined };
                    this.send(address, {
                        type: 'FILE_CHUNK',
                        ...chunkData,
                        ...enc,
                    });
                }
            }
            currentIndex++;
        }

        // 3. Always ensure a retry timer is running if we have unacked chunks
        // This prevents the transfer from stalling if the last ACKs are lost or the window is full
        const unackedCount = transfer.totalChunks - transfer.pendingChunks.size;
        if (unackedCount > 0 && !this.retryTimers.has(transfer.fileId)) {
            // BUG BV fix: guardar timer en Map separado; en el callback re-leer del store
            // para verificar el estado actual (no el del closure que puede ser stale).
            const timer = setTimeout(() => {
                this.retryTimers.delete(transfer.fileId);
                const current = this.store.getTransfer(transfer.fileId, 'sending');
                if (current && current.state === 'active') this.sendNextChunks(current, address);
            }, retryTimeout + 100);
            this.retryTimers.set(transfer.fileId, timer);
        }
    }

    private async completeReceiver(transfer: FileTransfer, address: string) {
        if (transfer.state === 'completed' || transfer.phase >= TransferPhase.VERIFYING) return;
        try {
            this.store.updateTransfer(transfer.fileId, 'receiving', { phase: TransferPhase.VERIFYING });

            // BUG AK fix: verificar integridad del archivo antes de marcarlo como completado.
            // Sin esta verificación un peer malicioso puede enviar chunks corruptos: el receptor
            // acumula totalChunks entries en pendingChunks y completa sin comprobar el hash,
            // guardando un archivo corrompido o malicioso como si fuera el original.
            if (transfer.fileHash && transfer.tempPath) {
                try {
                    await this.validator.verifyFileHash(transfer, transfer.fileHash);
                } catch (hashErr) {
                    error('File hash mismatch — transfer rejected', hashErr, 'file-transfer');
                    this.store.updateTransfer(transfer.fileId, 'receiving', { state: 'cancelled', phase: TransferPhase.DONE });
                    this.send(address, { type: 'FILE_CANCEL', fileId: transfer.fileId, reason: 'Hash mismatch' });
                    this.notifyUICancelled(transfer, 'Hash de archivo no coincide — transferencia rechazada');
                    // BUG EV fix: borrar archivo temporal tras fallo de integridad.
                    this.chunker.cleanupTempFile(transfer).catch(() => { });
                    return;
                }
            }

            const updated = this.store.updateTransfer(transfer.fileId, 'receiving', {
                state: 'completed',
                phase: TransferPhase.DONE
            });

            // Tell sender we are DONE
            this.send(address, {
                type: 'FILE_DONE_ACK',
                fileId: transfer.fileId
            });

            // Close and remove file handle
            const handle = this.fileHandles.get(transfer.fileId);
            if (handle) {
                await handle.close();
                this.fileHandles.delete(transfer.fileId);
            }
            // BUG BC fix: eliminar la clave AES-256 tras completar la transferencia.
            // Sin esto, las claves (32 bytes/transferencia) se acumulan durante toda
            // la sesión de la app en el Map transferKeys.
            this.transferKeys.delete(transfer.fileId);

            if (updated) {
                // Save to DB
                await this.saveToDB(updated);
                this.notifyUIProgress(updated); // Send one last progress update with 'completed' state
                this.notifyUICompleted(updated);
            }
            info('File transfer completed', { fileId: transfer.fileId }, 'file-transfer');
        } catch (err) {
            error('Error completing receiver', err, 'file-transfer');
        }
    }

    private send(address: string, data: any) {
        if (this.sendFunction) {
            this.sendFunction(address, data);
        }
    }

    private async saveToDB(transfer: FileTransfer) {
        try {
            const myId = getMyUPeerId();
            const isSelf = transfer.upeerId === myId;

            // For self-transfers, we only want one entry in the DB.
            // We save it when it's 'sending' (which happens at the end for self-transfer on the sender side).
            // If it's receiving from ourselves, we skip it to avoid duplication in ChatHistory.
            if (isSelf && transfer.direction === 'receiving') {
                return;
            }

            await saveFileMessage(
                transfer.fileId, // Use stable transfer ID to prevent duplicates
                transfer.upeerId,
                transfer.direction === 'sending' || isSelf,
                {
                    fileName: transfer.fileName,
                    fileSize: transfer.fileSize,
                    mimeType: transfer.mimeType,
                    fileHash: transfer.fileHash,
                    tempPath: transfer.tempPath,
                    filePath: transfer.filePath,
                    direction: transfer.direction,
                    transferId: transfer.fileId,
                    thumbnail: transfer.thumbnail,
                    state: transfer.state // Now we include the state in the DB
                } as any,
                undefined,
                isSelf ? 'read' : (transfer.state === 'completed' ? 'delivered' : 'sent')
            );
        } catch (err) {
            warn('Failed to save file message to DB', err, 'file-transfer');
        }
    }

    // --- UI NOTIFICATIONS ---

    private notifyUIStarted(transfer: FileTransfer) {
        this.window?.webContents.send('file-transfer-started', this.mapToUI(transfer));
    }

    private notifyUIProgress(transfer: FileTransfer) {
        const progress = Number(((transfer.chunksProcessed / transfer.totalChunks) * 100).toFixed(2));
        const bytesLoaded = transfer.chunksProcessed * transfer.chunkSize;

        this.window?.webContents.send('file-transfer-progress', {
            ...this.mapToUI(transfer),
            progress,
            bytesTransferred: Math.min(bytesLoaded, transfer.fileSize),
            totalBytes: transfer.fileSize,
            chunksTransferred: transfer.chunksProcessed
        });
    }

    private notifyUICompleted(transfer: FileTransfer) {
        this.window?.webContents.send('file-transfer-completed', this.mapToUI(transfer));
    }

    /**
     * Notify UI about background vault replication progress
     */
    public notifyVaultProgress(fileId: string, current: number, total: number) {
        const transfer = this.store.getTransfer(fileId, 'sending');
        if (!transfer) return;

        const isDone = current === total;
        const progress = Number(((current / total) * 100).toFixed(2));

        const updated = this.store.updateTransfer(fileId, 'sending', {
            chunksProcessed: current,
            totalChunks: total, // For vaulting, totalChunks reflects shards
            phase: isDone ? TransferPhase.VAULTED : TransferPhase.REPLICATING,
            state: 'active'
        });

        if (updated) {
            this.window?.webContents.send('file-transfer-progress', {
                ...this.mapToUI(updated),
                progress,
                isVaulting: true
            });

            if (isDone) {
                // When vaulted, update the DB status as well
                updateMessageStatus(fileId, 'vaulted' as any);
                this.window?.webContents.send('message-status-updated', { id: fileId, status: 'vaulted' });
            }
        }
    }

    private notifyUICancelled(transfer: FileTransfer, reason: string) {
        this.window?.webContents.send('file-transfer-cancelled', { ...this.mapToUI(transfer), reason });
    }

    private mapToUI(transfer: FileTransfer) {
        return {
            fileId: transfer.fileId,
            upeerId: transfer.upeerId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            direction: transfer.direction,
            state: transfer.state,
            phase: transfer.phase,
            chunksProcessed: transfer.chunksProcessed,
            totalChunks: transfer.totalChunks,
            thumbnail: transfer.thumbnail,
            fileHash: transfer.fileHash
        };
    }

    getAllTransfers() {
        return this.store.getAllTransfers();
    }

    getTransfer(fileId: string, direction: 'sending' | 'receiving') {
        return this.store.getTransfer(fileId, direction);
    }
}