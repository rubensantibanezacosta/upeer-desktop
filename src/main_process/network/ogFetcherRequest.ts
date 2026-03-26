import type { IncomingMessage } from 'node:http';
import { getClient, MAX_REDIRECTS, OG_TIMEOUT_MS } from './ogFetcherShared.js';

export function fetchWithTimeout(url: string, maxBytes: number, redirectsLeft = MAX_REDIRECTS): Promise<{ data: Buffer; contentType: string }> {
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
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
    });
}