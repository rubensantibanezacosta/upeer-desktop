import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronShim = pathToFileURL(path.join(__dirname, 'electron-shim.js')).href;
const socks5Shim = pathToFileURL(path.join(__dirname, 'socks5-shim.js')).href;
const yggstackShim = pathToFileURL(path.join(__dirname, 'yggstack-shim.js')).href;

export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'electron') {
        return { url: electronShim, shortCircuit: true };
    }
    if (specifier.endsWith('socks5.js') || specifier === 'socks5') {
        return { url: socks5Shim, shortCircuit: true };
    }
    if (specifier.endsWith('yggstack.js') || specifier === 'yggstack') {
        return { url: yggstackShim, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
