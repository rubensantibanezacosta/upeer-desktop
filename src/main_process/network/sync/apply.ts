import type { BrowserWindow } from 'electron';
import {
    deleteMessageLocally,
    deleteMessagesByChatId,
    getMessageById,
    updateMessageContent,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import type { MessageDeliveryStatus } from '../../storage/messages/status.js';
import { deleteReaction, saveReaction } from '../../storage/messages/reactions.js';
import { withSyncEventSuppressionAsync } from '../../storage/sync/eventSink.js';
import { upsertSyncMessage, type SyncedMessage } from '../../storage/sync/messages.js';
import type { SyncPlainEvent } from './types.js';

const VALID_STATUSES = new Set(['failed', 'sent', 'delivered', 'read', 'vaulted']);

export async function applySyncEvent(event: SyncPlainEvent, win: BrowserWindow | null): Promise<boolean> {
    return withSyncEventSuppressionAsync(async () => {
        switch (event.kind) {
            case 'MESSAGE_UPSERT':
                return applyMessageUpsert(event.payload, win);
            case 'MESSAGE_STATUS':
                return applyStatus(event.payload, win);
            case 'MESSAGE_EDIT':
                return applyEdit(event.payload, win);
            case 'MESSAGE_DELETE':
                return applyDelete(event.payload, win);
            case 'CHAT_CLEAR':
                return applyClear(event.payload, win);
            case 'REACTION_SET':
                return applyReaction(event.payload, win);
            default:
                return false;
        }
    });
}

function applyMessageUpsert(payload: Record<string, unknown>, win: BrowserWindow | null): boolean {
    const message = toSyncedMessage(payload);
    if (!message) return false;
    const result = upsertSyncMessage(message);
    if (result.applied && result.inserted) {
        win?.webContents.send('receive-p2p-message', {
            id: message.id,
            upeerId: message.chatUpeerId,
            isMine: message.isMine,
            message: message.message,
            replyTo: message.replyTo ?? undefined,
            status: message.status,
            encrypted: false,
            timestamp: message.timestamp,
        });
    }
    return result.applied;
}

async function applyStatus(payload: Record<string, unknown>, win: BrowserWindow | null): Promise<boolean> {
    if (typeof payload.id !== 'string' || typeof payload.status !== 'string') return false;
    if (!VALID_STATUSES.has(payload.status)) return false;
    const changed = await updateMessageStatus(payload.id, payload.status as MessageDeliveryStatus);
    if (changed) {
        win?.webContents.send('message-status-updated', { id: payload.id, status: payload.status });
    }
    return changed;
}

function applyEdit(payload: Record<string, unknown>, win: BrowserWindow | null): boolean {
    if (typeof payload.id !== 'string' || typeof payload.message !== 'string') return false;
    if (payload.message.length > 50_000) return false;
    const version = typeof payload.version === 'number' ? payload.version : 1;
    const existing = getMessageById(payload.id) as {
        chatUpeerId?: string;
        version?: number;
        isDeleted?: boolean;
    } | undefined;
    if (!existing || existing.isDeleted) return false;
    if ((existing.version ?? 1) > version) return false;
    const signature = typeof payload.signature === 'string' ? payload.signature : undefined;
    updateMessageContent(payload.id, payload.message, signature, version);
    win?.webContents.send('message-updated', {
        id: payload.id,
        upeerId: existing.chatUpeerId,
        chatUpeerId: existing.chatUpeerId,
        content: payload.message,
        signature,
    });
    return true;
}

function applyDelete(payload: Record<string, unknown>, win: BrowserWindow | null): boolean {
    if (typeof payload.id !== 'string') return false;
    const existing = getMessageById(payload.id) as { chatUpeerId?: string } | undefined;
    if (!existing) return false;
    deleteMessageLocally(payload.id, typeof payload.timestamp === 'number' ? payload.timestamp : undefined);
    win?.webContents.send('message-deleted', {
        id: payload.id,
        upeerId: existing.chatUpeerId,
        chatUpeerId: existing.chatUpeerId,
    });
    return true;
}

function applyClear(payload: Record<string, unknown>, win: BrowserWindow | null): boolean {
    if (typeof payload.chatUpeerId !== 'string') return false;
    const timestamp = typeof payload.clearTimestamp === 'number' ? payload.clearTimestamp : Date.now();
    deleteMessagesByChatId(payload.chatUpeerId, timestamp);
    win?.webContents.send('chat-cleared', { upeerId: payload.chatUpeerId });
    return true;
}

function applyReaction(payload: Record<string, unknown>, win: BrowserWindow | null): boolean {
    if (typeof payload.messageId !== 'string' || typeof payload.upeerId !== 'string' || typeof payload.emoji !== 'string') {
        return false;
    }
    const message = getMessageById(payload.messageId) as { chatUpeerId?: string } | undefined;
    if (!message) return false;
    if (payload.remove === true) {
        deleteReaction(payload.messageId, payload.upeerId, payload.emoji);
    } else {
        saveReaction(payload.messageId, payload.upeerId, payload.emoji);
    }
    win?.webContents.send('message-reaction-updated', {
        msgId: payload.messageId,
        upeerId: payload.upeerId,
        chatUpeerId: message.chatUpeerId,
        emoji: payload.emoji,
        remove: payload.remove === true,
    });
    return true;
}

function toSyncedMessage(payload: Record<string, unknown>): SyncedMessage | null {
    if (typeof payload.id !== 'string' || typeof payload.chatUpeerId !== 'string') return null;
    if (typeof payload.message !== 'string' || typeof payload.timestamp !== 'number') return null;
    if (typeof payload.status !== 'string' || !VALID_STATUSES.has(payload.status)) return null;
    return {
        id: payload.id,
        chatUpeerId: payload.chatUpeerId,
        senderUpeerId: typeof payload.senderUpeerId === 'string' ? payload.senderUpeerId : null,
        isMine: payload.isMine === true,
        message: payload.message,
        replyTo: typeof payload.replyTo === 'string' ? payload.replyTo : null,
        signature: typeof payload.signature === 'string' ? payload.signature : null,
        status: payload.status as MessageDeliveryStatus,
        version: typeof payload.version === 'number' ? payload.version : 1,
        isDeleted: payload.isDeleted === true,
        isEdited: payload.isEdited === true,
        timestamp: payload.timestamp,
    };
}

