import sharp from 'sharp';
import {
    decodeEntities,
    PREVIEW_IMAGE_QUALITIES,
    PREVIEW_IMAGE_SIDES,
    PREVIEW_IMAGE_TARGET_BYTES,
    resolveUrl,
} from './ogFetcherShared.js';

export function extractMeta(html: string, prop: string): string | undefined {
    const tagRe = /<meta\s[^>]+>/gi;
    let tag: RegExpExecArray | null;
    const propRe = new RegExp(`(?:property|name)=["']${prop}["']`, 'i');
    const contentRe = /content=["']([^"']*)["']/i;
    while ((tag = tagRe.exec(html)) !== null) {
        if (propRe.test(tag[0])) {
            const cm = contentRe.exec(tag[0]);
            if (cm) return decodeEntities(cm[1].trim());
        }
    }
    return undefined;
}

export function extractJsonLdImage(html: string): string | undefined {
    const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRe.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            const image = data?.image ?? data?.image?.url ?? data?.logo?.url;
            if (typeof image === 'string' && image.startsWith('http')) return image;
            if (Array.isArray(image) && typeof image[0] === 'string') return image[0];
        } catch {
            continue;
        }
    }
    return undefined;
}

export function extractAllImageCandidates(html: string, base: string): string[] {
    const seen = new Set<string>();
    const add = (url: string | undefined, list: string[]) => {
        if (!url) return;
        const resolved = resolveUrl(url, base);
        if (!seen.has(resolved)) {
            seen.add(resolved);
            list.push(resolved);
        }
    };

    const tier0: string[] = [];
    add(extractMeta(html, 'og:image:secure_url'), tier0);
    add(extractMeta(html, 'og:image'), tier0);
    add(extractMeta(html, 'og:image:url'), tier0);

    const tier1: string[] = [];
    add(extractMeta(html, 'twitter:image'), tier1);
    add(extractMeta(html, 'twitter:image:src'), tier1);

    const tier2: string[] = [];
    add(extractJsonLdImage(html), tier2);

    const tier3: string[] = [];
    const linkRe = /<link\s[^>]+>/gi;
    const relRe = /rel=["']([^"']*)["']/i;
    const hrefRe = /href=["']([^"']+)["']/i;
    const sizesRe = /sizes=["'](\d+)x/i;
    const iconCandidates: { size: number; href: string }[] = [];
    let tag: RegExpExecArray | null;

    while ((tag = linkRe.exec(html)) !== null) {
        const relMatch = relRe.exec(tag[0]);
        if (!relMatch) continue;
        const rel = relMatch[1].toLowerCase();
        const hrefMatch = hrefRe.exec(tag[0]);
        if (!hrefMatch) continue;
        if (rel === 'image_src') add(hrefMatch[1], tier3);
        else if (rel.includes('apple-touch-icon')) {
            const sizeMatch = sizesRe.exec(tag[0]);
            iconCandidates.push({ size: sizeMatch ? parseInt(sizeMatch[1], 10) : 180, href: hrefMatch[1] });
        } else if (rel.includes('icon') && !rel.includes('shortcut')) {
            const sizeMatch = sizesRe.exec(tag[0]);
            iconCandidates.push({ size: sizeMatch ? parseInt(sizeMatch[1], 10) : 32, href: hrefMatch[1] });
        }
    }

    const tier4: string[] = [];
    add(extractMeta(html, 'msapplication-TileImage'), tier4);
    add(extractMeta(html, 'thumbnail'), tier4);
    add(extractMeta(html, 'thumbnail_url'), tier4);

    const itempropRe = /<(?:meta|img|link)\s[^>]+itemprop=["']image["'][^>]*(?:content|src|href)=["']([^"']+)["'][^>]*>/gi;
    let imageMatch: RegExpExecArray | null;
    while ((imageMatch = itempropRe.exec(html)) !== null) add(imageMatch[1], tier4);

    iconCandidates.sort((a, b) => b.size - a.size);
    const tier5: string[] = [];
    for (const icon of iconCandidates) add(icon.href, tier5);

    const tier6: string[] = [];
    try {
        tier6.push(`${new URL(base).origin}/favicon.ico`);
    } catch {
        void 0;
    }

    return [...tier0, ...tier1, ...tier2, ...tier3, ...tier4, ...tier5, ...tier6];
}

export function extractTitle(html: string): string | undefined {
    const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return match ? decodeEntities(match[1].trim()) : undefined;
}

export async function optimizePreviewImage(data: Buffer, contentType: string): Promise<string | undefined> {
    if (data.length <= 512) return undefined;

    const mimeType = contentType.split(';')[0] || 'image/webp';
    const originalDataUrl = `data:${mimeType};base64,${data.toString('base64')}`;
    if (data.length <= PREVIEW_IMAGE_TARGET_BYTES) {
        return originalDataUrl;
    }

    let bestBuffer: Buffer | null = null;

    try {
        for (const side of PREVIEW_IMAGE_SIDES) {
            for (const quality of PREVIEW_IMAGE_QUALITIES) {
                const candidate = await sharp(data, { animated: false, limitInputPixels: 16_000_000 })
                    .rotate()
                    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality })
                    .toBuffer();

                if (!bestBuffer || candidate.length < bestBuffer.length) {
                    bestBuffer = candidate;
                }

                if (candidate.length <= PREVIEW_IMAGE_TARGET_BYTES) {
                    return `data:image/webp;base64,${candidate.toString('base64')}`;
                }
            }
        }
    } catch {
        return data.length <= PREVIEW_IMAGE_TARGET_BYTES ? originalDataUrl : undefined;
    }

    return bestBuffer ? `data:image/webp;base64,${bestBuffer.toString('base64')}` : undefined;
}