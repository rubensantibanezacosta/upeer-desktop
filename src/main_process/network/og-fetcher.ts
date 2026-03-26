import { extractDomain, LinkPreview, MAX_HTML_BYTES, MAX_IMAGE_BYTES } from './ogFetcherShared.js';
import { extractAllImageCandidates, extractMeta, extractTitle, optimizePreviewImage } from './ogFetcherParsing.js';
import { fetchWithTimeout } from './ogFetcherRequest.js';

export type { LinkPreview } from './ogFetcherShared.js';

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
                    imageBase64 = await optimizePreviewImage(imgData, imgType);
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
