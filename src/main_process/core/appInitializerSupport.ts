import { app, BrowserWindow, protocol, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { broadcastDhtUpdate, checkHeartbeat } from '../network/messaging/heartbeat.js';
import { getContacts } from '../storage/contacts/operations.js';
import { fileTransferManager } from '../network/file-transfer/transfer-manager.js';
import { info, error as logError } from '../security/secure-logger.js';
import { onYggstackAddress } from '../sidecars/yggstack.js';

export const ensureInternalAssetsDir = () => {
    const internalAssetsDir = path.join(app.getPath('userData'), 'assets');
    if (!fs.existsSync(internalAssetsDir)) {
        fs.mkdirSync(internalAssetsDir, { recursive: true });
        info('[Init] Directorio de assets internos creado', { path: internalAssetsDir }, 'init');
    }
};

export const configureProxy = async () => {
    await session.defaultSession.setProxy({
        proxyRules: 'socks5://127.0.0.1:9050',
        proxyBypassRules: 'localhost',
    });
    info('[Proxy] SOCKS5 configurado', { proxy: 'socks5://127.0.0.1:9050', bypass: 'localhost' }, 'proxy');
};

const buildMediaResponse = async (filePath: string, range: string | null) => {
    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    let responseStatus = 200;
    let start = 0;
    let end = stats.size - 1;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        responseStatus = 206;
        info(`[Protocol] Serving 206 Partial Content: ${start}-${end}/${stats.size}`, {}, 'network');
    } else {
        info(`[Protocol] Serving 200 OK (Full File): ${stats.size} bytes`, {}, 'network');
    }

    const chunksize = (end - start) + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(stream);

    return new Response(webStream as unknown as ReadableStream, {
        status: responseStatus,
        statusText: responseStatus === 206 ? 'Partial Content' : 'OK',
        headers: {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Range': responseStatus === 206 ? `bytes ${start}-${end}/${stats.size}` : undefined as any,
        }
    });
};

const resolveMediaPath = (requestUrl: string) => {
    const url = new URL(requestUrl);
    if (process.platform === 'win32') {
        const drive = url.hostname;
        const remainingPath = decodeURIComponent(url.pathname);
        return path.normalize(drive + ':' + remainingPath);
    }

    const combinedPath = url.hostname + decodeURIComponent(url.pathname);
    const normalized = path.normalize(combinedPath);
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const validateMediaPath = (filePath: string) => {
    const normalizeForGrant = (currentPath: string) => {
        const normalized = path.normalize(currentPath);
        return normalized.endsWith(path.sep) ? normalized : normalized + path.sep;
    };

    const assetsDir = normalizeForGrant(path.join(app.getPath('userData'), 'assets'));
    const tempDir = normalizeForGrant(app.getPath('temp'));
    const filePathCheck = filePath.endsWith(path.sep) ? filePath : filePath + path.sep;
    const isUnderAssets = filePathCheck.startsWith(assetsDir);
    const isUnderTemp = filePathCheck.startsWith(tempDir);

    if (!isUnderAssets && !isUnderTemp) {
        return { ok: false, response: new Response('Access Denied', { status: 403 }) };
    }

    const sensitivePatterns = [
        /[\\/]\.ssh[\\/]/, /[\\/]\.gnupg[\\/]/, /[\\/]\.aws[\\/]/,
        /\.env$/, /config\.json$/, /identity\.json$/,
        /dht-cache\.json$/, /ratchet-state\.json$/, /\.sqlite-wal$/, /\.sqlite-shm$/
    ];
    if (sensitivePatterns.some((pattern) => pattern.test(filePath))) {
        return { ok: false, response: new Response('Access Denied', { status: 403 }) };
    }

    return { ok: true };
};

export const registerMediaProtocol = async () => {
    protocol.handle('media', async (request) => {
        try {
            const filePath = resolveMediaPath(request.url);
            const validation = validateMediaPath(filePath);
            if (!validation.ok) {
                logError('[Protocol] Bloqueado acceso media://', { path: filePath }, 'security');
                return validation.response;
            }

            info(`[Protocol] Requesting: ${filePath}, Range: ${request.headers.get('range') || 'none'}`, {}, 'network');
            try {
                return await buildMediaResponse(filePath, request.headers.get('range'));
            } catch (error) {
                info(`[Protocol] Error sirviendo ${filePath}: ${String(error)}`, {}, 'network');
                return new Response('File error', { status: 404 });
            }
        } catch (err) {
            logError('[Protocol] Error crítico en media://', { err: String(err), url: request.url }, 'app');
            return new Response('Invalid media URL', { status: 400 });
        }
    });
    info('[Protocol] media:// registrado', {}, 'app');
};

export const createMainWindow = async (baseDir: string, devServerUrl: string | undefined, viteName: string) => {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(baseDir, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
    });

    mainWindow.maximize();

    if (devServerUrl) {
        await mainWindow.loadURL(devServerUrl);
    } else {
        await mainWindow.loadFile(path.join(baseDir, `../renderer/${viteName}/index.html`));
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (['http:', 'https:'].includes(parsed.protocol)) {
                void shell.openExternal(url);
            }
        } catch (error) {
            logError('[Window] URL externa inválida bloqueada', { url, err: String(error) }, 'security');
        }
        return { action: 'deny' };
    });

    return mainWindow;
};

export const scheduleYggstackStartupTasks = (isSessionLocked: () => boolean) => {
    onYggstackAddress(() => {
        setTimeout(() => {
            if (!isSessionLocked()) {
                broadcastDhtUpdate();
            }
        }, 2000);

        setTimeout(() => {
            if (isSessionLocked()) {
                return;
            }
            checkHeartbeat(getContacts());
            import('../network/vault/manager.js')
                .then(({ VaultManager }) => VaultManager.queryOwnVaults())
                .catch((error) => {
                    logError('[Vault] Error querying own vaults after yggstack ready', { err: String(error) }, 'vault');
                });
        }, 4000);
    });
};

export const startBackgroundIntervals = (isSessionLocked: () => boolean) => {
    const dhtInterval = setInterval(() => {
        if (!isSessionLocked()) {
            broadcastDhtUpdate();
        }
    }, 5000);

    const heartbeatInterval = setInterval(() => {
        if (isSessionLocked()) {
            return;
        }
        const contacts = getContacts();
        checkHeartbeat(contacts);
        fileTransferManager.checkStaleTransfers();
    }, 10000);

    return { dhtInterval, heartbeatInterval };
};