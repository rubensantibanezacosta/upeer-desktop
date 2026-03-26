import https from 'node:https';
import http from 'node:http';

export interface LinkPreview {
    url: string;
    title?: string;
    description?: string;
    imageBase64?: string;
    domain?: string;
}

export const OG_TIMEOUT_MS = 3500;
export const MAX_HTML_BYTES = 128 * 1024;
export const MAX_IMAGE_BYTES = 512 * 1024;
export const MAX_REDIRECTS = 2;
export const PREVIEW_IMAGE_TARGET_BYTES = 18 * 1024;
export const PREVIEW_IMAGE_SIDES = [320, 240, 160];
export const PREVIEW_IMAGE_QUALITIES = [60, 45, 30];

export function getClient(protocol: string) {
    return protocol === 'https:' ? https : http;
}

export function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'");
}

export function resolveUrl(src: string, base: string): string {
    try {
        return new URL(src, base).toString();
    } catch {
        return src;
    }
}

export function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}