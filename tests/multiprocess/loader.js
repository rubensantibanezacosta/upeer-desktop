import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronShim = pathToFileURL(path.join(__dirname, 'electron-shim.js')).href;
const socks5Shim = pathToFileURL(path.join(__dirname, 'socks5-shim.js')).href;
const yggstackShim = pathToFileURL(path.join(__dirname, 'yggstack-shim.js')).href;
const socks5UdpShim = pathToFileURL(path.join(__dirname, 'socks5-udp-shim.js')).href;

const normalizeSpecifier = (specifier) => specifier.split('?')[0].replace(/\\/g, '/');

export async function resolve(specifier, context, nextResolve) {
    const normalized = normalizeSpecifier(specifier);
    if (normalized === 'electron') {
        return { url: electronShim, shortCircuit: true };
    }
    if (/(^|\/)socks5(\.js|\.ts)$/.test(normalized) || normalized === 'socks5') {
        return { url: socks5Shim, shortCircuit: true };
    }
    if (/(^|\/)yggstack(\.js|\.ts)$/.test(normalized) || normalized === 'yggstack') {
        return { url: yggstackShim, shortCircuit: true };
    }
    if (/(^|\/)socks5Udp(\.js|\.ts)$/.test(normalized)) {
        return { url: socks5UdpShim, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
