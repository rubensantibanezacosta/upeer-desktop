import https from 'node:https';
import http from 'node:http';
import type { IncomingMessage } from 'node:http';

export interface LinkPreview {
    url: string;
    title?: string;
    description?: string;
    imageBase64?: string;
    domain?: string;
}

const OG_TIMEOUT_MS = 3500;
const MAX_HTML_BYTES = 128 * 1024;
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;

function getClient(protocol: string) {
    return protocol === 'https:' ? https : http;
}

function fetchWithTimeout(url: string, maxBytes: number, redirectsLeft = MAX_REDIRECTS): Promise<{ data: Buffer; contentType: string }> {
    return new Promise((resolve, reject) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            reject(new Error('Invalid URL'));
            return;
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            reject(new Error('Protocol not allowed'));
            return;
        }

        const req = getClient(parsed.protocol).get(url, {
            timeout: OG_TIMEOUT_MS,
            headers: {
                'User-Agent': 'Twitterbot/1.0',
                'Accept': 'text/html,application/xhtml+xml,*/*',
            },
        }, (res: IncomingMessage) => {
            const status = res.statusCode ?? 0;

            if ([301, 302, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                try {
                    const next = new URL(res.headers.location, url).toString();
                    fetchWithTimeout(next, maxBytes, redirectsLeft - 1).then(resolve).catch(reject);
                } catch {
                    reject(new Error('Invalid redirect'));
                }
                return;
            }

            const contentType = res.headers['content-type'] ?? 'text/html';
            const chunks: Buffer[] = [];
            let total = 0;

            res.on('data', (chunk: Buffer) => {
                total += chunk.length;
                chunks.push(chunk);
                if (total >= maxBytes) {
                    req.destroy();
                    resolve({ data: Buffer.concat(chunks), contentType });
                }
            });

            res.on('end', () => resolve({ data: Buffer.concat(chunks), contentType }));
            res.on('error', reject);
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function extractMeta(html: string, prop: string): string | undefined {
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

function extractJsonLdImage(html: string): string | undefined {
    const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html)) !== null) {
        try {
            const data = JSON.parse(m[1]);
            const img = data?.image ?? data?.image?.url ?? data?.logo?.url;
            if (typeof img === 'string' && img.startsWith('http')) return img;
            if (Array.isArray(img) && typeof img[0] === 'string') return img[0];
        } catch { /* skip */ }
    }
    return undefined;
}

function extractAllImageCandidates(html: string, base: string): string[] {
    const seen = new Set<string>();
    const add = (url: string | undefined, list: string[]) => {
        if (!url) return;
        const resolved = resolveUrl(url, base);
        if (!seen.has(resolved)) { seen.add(resolved); list.push(resolved); }
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
        const relM = relRe.exec(tag[0]);
        if (!relM) continue;
        const rel = relM[1].toLowerCase();
        const hrefM = hrefRe.exec(tag[0]);
        if (!hrefM) continue;
        if (rel === 'image_src') add(hrefM[1], tier3);
        else if (rel.includes('apple-touch-icon')) {
            const sizeM = sizesRe.exec(tag[0]);
            iconCandidates.push({ size: sizeM ? parseInt(sizeM[1], 10) : 180, href: hrefM[1] });
        } else if (rel.includes('icon') && !rel.includes('shortcut')) {
            const sizeM = sizesRe.exec(tag[0]);
            iconCandidates.push({ size: sizeM ? parseInt(sizeM[1], 10) : 32, href: hrefM[1] });
        }
    }

    const tier4: string[] = [];
    add(extractMeta(html, 'msapplication-TileImage'), tier4);
    add(extractMeta(html, 'thumbnail'), tier4);
    add(extractMeta(html, 'thumbnail_url'), tier4);

    const itempropRe = /<(?:meta|img|link)\s[^>]+itemprop=["']image["'][^>]*(?:content|src|href)=["']([^"']+)["'][^>]*>/gi;
    let im: RegExpExecArray | null;
    while ((im = itempropRe.exec(html)) !== null) add(im[1], tier4);

    iconCandidates.sort((a, b) => b.size - a.size);
    const tier5: string[] = [];
    for (const ic of iconCandidates) add(ic.href, tier5);

    const tier6: string[] = [];
    try { tier6.push(`${new URL(base).origin}/favicon.ico`); } catch { /* skip */ }

    return [...tier0, ...tier1, ...tier2, ...tier3, ...tier4, ...tier5, ...tier6];
}

function extractTitle(html: string): string | undefined {
    const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return m ? decodeEntities(m[1].trim()) : undefined;
}

function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'");
}

function resolveUrl(src: string, base: string): string {
    try {
        return new URL(src, base).toString();
    } catch {
        return src;
    }
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

export async function fetchOgPreview(url: string): Promise<LinkPreview | null> {
    try {
        const { data, contentType } = await fetchWithTimeout(url, MAX_HTML_BYTES);

        if (!contentType.includes('html')) return null;

        const html = data.toString('utf-8');

        const title = extractMeta(html, 'og:title')
            ?? extractMeta(html, 'twitter:title')
            ?? extractTitle(html);
        const description = extractMeta(html, 'og:description')
            ?? extractMeta(html, 'twitter:description')
            ?? extractMeta(html, 'description');
        if (!title && !description) return null;

        let imageBase64: string | undefined;
        const imageCandidates = extractAllImageCandidates(html, url);

        for (const candidate of imageCandidates) {
            try {
                const { data: imgData, contentType: imgType } = await fetchWithTimeout(candidate, MAX_IMAGE_BYTES);
                if (imgData.length > 512) {
                    imageBase64 = `data:${imgType.split(';')[0]};base64,${imgData.toString('base64')}`;
                    break;
                }
            } catch {
                continue;
            }
        }

        return {
            url,
            title: title?.slice(0, 200),
            description: description?.slice(0, 400),
            imageBase64,
            domain: extractDomain(url),
        };
    } catch {
        return null;
    }
}
