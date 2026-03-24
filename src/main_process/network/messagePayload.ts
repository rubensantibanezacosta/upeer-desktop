import sharp from 'sharp';

type LinkPreviewPayload = {
    url: string;
    title?: string;
    description?: string;
    imageBase64?: string;
    domain?: string;
};

const MAX_SERIALIZED_MESSAGE_PAYLOAD_CHARS = 90_000;
const PAYLOAD_PREVIEW_IMAGE_TARGET_BYTES = 18 * 1024;
const PAYLOAD_PREVIEW_IMAGE_SIDES = [320, 240, 160];
const PAYLOAD_PREVIEW_IMAGE_QUALITIES = [60, 45, 30];

function serializeTextWithPreview(text: string, linkPreview: LinkPreviewPayload): string | null {
    const serialized = JSON.stringify({ text, linkPreview });
    return serialized.length <= MAX_SERIALIZED_MESSAGE_PAYLOAD_CHARS ? serialized : null;
}

function parseDataUrlImage(dataUrl: string): { buffer: Buffer } | null {
    const match = /^data:[^;,]+;base64,(.+)$/s.exec(dataUrl);
    if (!match) return null;

    try {
        return {
            buffer: Buffer.from(match[1], 'base64'),
        };
    } catch {
        return null;
    }
}

async function shrinkPreviewImage(imageBase64: string): Promise<string | null> {
    const parsed = parseDataUrlImage(imageBase64);
    if (!parsed) return null;
    if (parsed.buffer.length <= PAYLOAD_PREVIEW_IMAGE_TARGET_BYTES) return imageBase64;

    let bestBuffer: Buffer | null = null;

    try {
        for (const side of PAYLOAD_PREVIEW_IMAGE_SIDES) {
            for (const quality of PAYLOAD_PREVIEW_IMAGE_QUALITIES) {
                const candidate = await sharp(parsed.buffer, { animated: false, limitInputPixels: 16_000_000 })
                    .rotate()
                    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality })
                    .toBuffer();

                if (!bestBuffer || candidate.length < bestBuffer.length) {
                    bestBuffer = candidate;
                }

                if (candidate.length <= PAYLOAD_PREVIEW_IMAGE_TARGET_BYTES) {
                    return `data:image/webp;base64,${candidate.toString('base64')}`;
                }
            }
        }
    } catch {
        return null;
    }

    return bestBuffer ? `data:image/webp;base64,${bestBuffer.toString('base64')}` : null;
}

export async function buildMessagePayload(text: string, linkPreview?: LinkPreviewPayload | null): Promise<string> {
    if (!linkPreview) {
        return text;
    }

    const fullPayload = serializeTextWithPreview(text, linkPreview);
    if (fullPayload) {
        return fullPayload;
    }

    if (linkPreview.imageBase64) {
        const shrunkImage = await shrinkPreviewImage(linkPreview.imageBase64);
        if (shrunkImage && shrunkImage !== linkPreview.imageBase64) {
            const shrunkPayload = serializeTextWithPreview(text, {
                ...linkPreview,
                imageBase64: shrunkImage,
            });
            if (shrunkPayload) {
                return shrunkPayload;
            }
        }

        const { imageBase64: _imageBase64, ...withoutImage } = linkPreview;
        const withoutImagePayload = serializeTextWithPreview(text, withoutImage);
        if (withoutImagePayload) {
            return withoutImagePayload;
        }
    }

    return text;
}
