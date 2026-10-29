import type { LatestReactionPreview } from '../../types/chat.js';
import { resolveFileMimeType } from '../../utils/fileUtils.js';
import { getContactCardSummary } from './message/messageItemSupport.js';
import { systemPreviewText } from './chatAreaSupport.js';

const TEXT_LIMIT = 64;
const FILE_LIMIT = 48;

const compact = (value: string, limit: number): string => {
    const text = value.replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trimEnd()}…`;
};

const quoted = (value: string, limit = TEXT_LIMIT): string => {
    const text = compact(value, limit);
    return text ? `"${text}"` : '';
};

const parseJson = (message: string): Record<string, unknown> | undefined => {
    if (!message.startsWith('{') || !message.endsWith('}')) return undefined;
    try {
        const parsed = JSON.parse(message);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
};

const describeAttachment = (fileName: string, mimeType: string, isVoiceNote: boolean): string => {
    if (isVoiceNote) return 'a la nota de voz';
    const mime = resolveFileMimeType(mimeType, fileName);
    const name = quoted(fileName, FILE_LIMIT);
    if (mime.startsWith('image/')) return name ? `a la imagen ${name}` : 'a una imagen';
    if (mime.startsWith('video/')) return name ? `al vídeo ${name}` : 'a un vídeo';
    return name ? `al archivo ${name}` : 'a un archivo';
};

export const describeReactedContent = (message: string): string => {
    if (!message) return '';
    const system = systemPreviewText(message);
    if (system) return `al aviso ${quoted(system)}`;
    if (getContactCardSummary(message)) return 'a una tarjeta de contacto';
    const parsed = parseJson(message);
    if (parsed?.type === 'file' || parsed?.type === 'image') {
        return describeAttachment(
            typeof parsed.fileName === 'string' ? parsed.fileName : '',
            typeof parsed.mimeType === 'string' ? parsed.mimeType : '',
            parsed.isVoiceNote === true
        );
    }
    if (typeof parsed?.text === 'string') {
        const text = quoted(parsed.text);
        return text ? `al mensaje ${text}` : '';
    }
    if (message.startsWith('FILE_TRANSFER|')) {
        const parts = message.split('|');
        if (parts.length >= 6) return describeAttachment(parts[2] || '', parts[4] || '', false);
    }
    const text = quoted(message);
    return text ? `al mensaje ${text}` : '';
};

export const reactionPreviewText = (reaction: LatestReactionPreview): string => {
    const actorName = reaction.actorName?.trim() || 'Alguien';
    const actor = reaction.actorIsMe ? 'Reaccionaste' : `${actorName} reaccionó`;
    const emoji = reaction.emoji?.trim();
    const stated = emoji ? `${actor} con ${emoji}` : actor;
    const content = describeReactedContent(reaction.message ?? '');
    return content ? `${stated} ${content}` : stated;
};
