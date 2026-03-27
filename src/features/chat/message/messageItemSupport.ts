import type { LinkPreview } from '../../../types/chat.js';
import type { FileTransfer } from '../../../hooks/fileTransferTypes.js';
import type { FileMessageData } from '../file/FileMessageItem.js';

export interface ContactCardData {
    name: string;
    address: string;
    upeerId: string;
    publicKey?: string;
    avatar?: string;
    text?: string | null;
}

export interface ParsedMessageData {
    cardData: ContactCardData | null;
    fileData: FileMessageData | null;
    isJSONFile: boolean;
    linkPreviewData: LinkPreview | null;
    textContent: string | null;
}

const parseMessageJson = (message: string) => {
    try {
        return JSON.parse(message);
    } catch {
        return undefined;
    }
};

const parseContactCardJson = (message: string): ContactCardData | null => {
    if (!message.startsWith('{') || !message.endsWith('}')) {
        return null;
    }

    const parsed = parseMessageJson(message);
    if (parsed?.type !== 'contact_card') {
        return null;
    }

    const contact = parsed.contact ?? {};
    return {
        name: contact.name || '',
        address: contact.address || '',
        upeerId: contact.upeerId || '',
        publicKey: contact.publicKey || undefined,
        avatar: contact.avatar || undefined,
        text: typeof parsed.text === 'string' ? parsed.text : null,
    };
};

export const getContactCardSummary = (message: string): string | null => {
    const cardData = parseContactCardJson(message);
    if (!cardData) {
        return null;
    }

    return cardData.text?.trim() || 'Tarjeta de contacto';
};

export const parseMessage = (message: string, isMe: boolean, activeTransfers: FileTransfer[]): ParsedMessageData => {
    let cardData: ContactCardData | null = null;
    let fileData: FileMessageData | null = null;
    let isJSONFile = false;
    let linkPreviewData: LinkPreview | null = null;
    let textContent: string | null = null;

    if (message.startsWith('{') && message.endsWith('}')) {
        const parsed = parseMessageJson(message);
        const parsedCardData = parseContactCardJson(message);
        if (parsedCardData) {
            cardData = parsedCardData;
            textContent = parsedCardData.text ?? null;
        } else if (parsed?.type === 'file') {
            isJSONFile = true;
            const direction = parsed.direction || (isMe ? 'sending' : 'receiving');
            const activeTransfer = activeTransfers.find((transfer) =>
                (transfer.fileId === parsed.transferId || transfer.fileId === parsed.fileId) && transfer.direction === direction,
            );
            const phase = activeTransfer?.phase;
            const isFinished = activeTransfer ? (
                (typeof phase === 'number' && (phase === 4 || phase === 5 || phase === 6 || phase === 8)) ||
                phase === 'verifying' || phase === 'completing' || phase === 'done' || activeTransfer.state === 'completed'
            ) : false;
            const transferState = activeTransfer ? (isFinished ? 'completed' : activeTransfer.state) : (parsed.state || 'completed');
            fileData = {
                fileId: parsed.transferId || parsed.fileId,
                fileName: parsed.fileName,
                fileSize: parsed.fileSize,
                mimeType: parsed.mimeType,
                fileHash: parsed.fileHash,
                thumbnail: parsed.thumbnail,
                caption: parsed.caption,
                transferState,
                progress: activeTransfer ? (transferState === 'completed' ? 100 : activeTransfer.progress) : (parsed.state === 'completed' || !parsed.state ? 100 : 0),
                direction,
                isVaulting: activeTransfer?.isVaulting,
                isVoiceNote: parsed.isVoiceNote || activeTransfer?.isVoiceNote,
                filePath: parsed.filePath || activeTransfer?.filePath,
                savedPath: parsed.savedPath || activeTransfer?.savedPath || (direction === 'sending' ? (parsed.filePath || activeTransfer?.filePath) : (parsed.tempPath || activeTransfer?.tempPath)),
            };
        } else if (parsed?.linkPreview && typeof parsed.text === 'string') {
            linkPreviewData = parsed.linkPreview as LinkPreview;
            textContent = parsed.text;
        }
    }

    if (!fileData && message.startsWith('FILE_TRANSFER|')) {
        const parts = message.split('|');
        if (parts.length >= 6) {
            const direction = isMe ? 'sending' as const : 'receiving' as const;
            let transferState: FileMessageData['transferState'] = 'completed';
            let progress = 100;
            const activeTransfer = activeTransfers.find((transfer) => transfer.fileId === parts[1] && transfer.direction === direction);
            if (activeTransfer) {
                transferState = activeTransfer.state;
                progress = activeTransfer.progress || 0;
            } else if (message.includes('|failed')) {
                transferState = 'failed';
            } else if (message.includes('|cancelled')) {
                transferState = 'cancelled';
            }

            fileData = {
                fileId: parts[1],
                fileName: parts[2],
                fileSize: parseInt(parts[3], 10),
                mimeType: parts[4],
                fileHash: parts[5],
                thumbnail: parts[6] && parts[6] !== 'undefined' ? parts[6] : undefined,
                transferState,
                progress,
                direction,
                isVaulting: activeTransfer?.isVaulting,
                filePath: activeTransfer?.filePath,
                savedPath: activeTransfer?.savedPath || (transferState === 'completed' ? activeTransfer?.tempPath : undefined),
            };
        }
    }

    return { cardData, fileData, isJSONFile, linkPreviewData, textContent };
};

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];

export const getQuickEmojiLabel = (emoji: string) => {
    if (emoji === '👍') {
        return 'Me gusta';
    }
    if (emoji === '❤️') {
        return 'Me encanta';
    }
    if (emoji === '😂') {
        return 'Me divierte';
    }
    if (emoji === '😮') {
        return 'Me asombra';
    }
    if (emoji === '😢') {
        return 'Me entristece';
    }
    return 'No me gusta';
};