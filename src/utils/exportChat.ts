import type { ChatMessage } from '../types/chat.js';
import { parseMessageTimestamp } from './dateTime.js';

interface TranscriptOptions {
    chatName: string;
    meLabel: string;
    messages: ChatMessage[];
}

const pad = (value: number) => String(value).padStart(2, '0');

const formatStamp = (value?: string | number | null): string => {
    const timestamp = parseMessageTimestamp(value);
    if (timestamp === null) {
        return '';
    }
    const date = new Date(timestamp);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const buildChatTranscript = ({ chatName, meLabel, messages }: TranscriptOptions): string => {
    const header = [
        `Conversación: ${chatName}`,
        `Exportada: ${formatStamp(Date.now())}`,
        `Mensajes: ${messages.length}`,
        '',
    ];
    const lines = messages.map((message) => {
        const author = message.isSystem
            ? 'Sistema'
            : message.isMine
                ? meLabel
                : message.senderName || message.senderUpeerId || chatName;
        const body = message.isDeleted ? 'Mensaje eliminado' : message.message || '[adjunto]';
        const edited = message.isEdited ? ' (editado)' : '';
        return `[${formatStamp(message.date || message.timestamp)}] ${author}: ${body}${edited}`;
    });
    return [...header, ...lines, ''].join('\n');
};

const sanitizeFileName = (value: string): string =>
    value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'conversacion';

export const exportChatTranscript = (options: TranscriptOptions): string => {
    const text = buildChatTranscript(options);
    const fileName = `${sanitizeFileName(options.chatName)}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return fileName;
};
