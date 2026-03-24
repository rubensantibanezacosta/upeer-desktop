import type { LinkPreview } from '../../../types/chat.js';

export interface ForwardTarget {
    id: string;
    isGroup: boolean;
}

type ForwardTextPayload = {
    kind: 'text';
    content: string;
    linkPreview: LinkPreview | null;
};

type ForwardFilePayload = {
    kind: 'file';
    fileName: string;
    filePath: string | null;
    thumbnail?: string;
    caption?: string;
    isVoiceNote?: boolean;
};

type ForwardPayload = ForwardTextPayload | ForwardFilePayload;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function parseForwardPayload(message: string): ForwardPayload {
    if (message.startsWith('{') && message.endsWith('}')) {
        try {
            const parsed = JSON.parse(message);
            if (parsed.type === 'file') {
                const filePath = [parsed.filePath, parsed.savedPath, parsed.tempPath].find(isNonEmptyString) ?? null;
                return {
                    kind: 'file',
                    fileName: isNonEmptyString(parsed.fileName) ? parsed.fileName : 'archivo',
                    filePath,
                    thumbnail: isNonEmptyString(parsed.thumbnail) ? parsed.thumbnail : undefined,
                    caption: isNonEmptyString(parsed.caption) ? parsed.caption : undefined,
                    isVoiceNote: parsed.isVoiceNote === true,
                };
            }
            if (parsed.linkPreview && typeof parsed.text === 'string') {
                return {
                    kind: 'text',
                    content: parsed.text,
                    linkPreview: parsed.linkPreview as LinkPreview,
                };
            }
        } catch {
            return { kind: 'text', content: message, linkPreview: null };
        }
    }

    return { kind: 'text', content: message, linkPreview: null };
}

export async function forwardMessageToTargets(message: string, targets: ForwardTarget[]) {
    const payload = parseForwardPayload(message);

    if (payload.kind === 'file') {
        if (!payload.filePath) {
            return { forwarded: 0, failed: targets.length };
        }

        const persisted = await window.upeer.persistInternalAsset({
            filePath: payload.filePath,
            fileName: payload.fileName,
        });

        if (!persisted.success || !persisted.path) {
            return { forwarded: 0, failed: targets.length };
        }

        let forwarded = 0;

        for (const target of targets) {
            const result = await window.upeer.startFileTransfer(
                target.id,
                persisted.path,
                payload.thumbnail,
                payload.caption,
                payload.isVoiceNote,
                payload.fileName,
            );

            if (result.success) {
                forwarded += 1;
            }
        }

        return { forwarded, failed: targets.length - forwarded };
    }

    let forwarded = 0;

    for (const target of targets) {
        const result = target.isGroup
            ? await window.upeer.sendGroupMessage(target.id, payload.content, undefined, payload.linkPreview ?? undefined)
            : await window.upeer.sendMessage(target.id, payload.content, undefined, payload.linkPreview ?? undefined);

        if (result) {
            forwarded += 1;
        }
    }

    return { forwarded, failed: targets.length - forwarded };
}
