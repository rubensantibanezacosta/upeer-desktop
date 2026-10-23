import { connectMediaVerifier } from './media-verifier-shim.js';

const appListeners = new Map();

export const app = {
    isPackaged: false,
    commandLine: { appendSwitch: () => undefined },
    getPath: (name) => (name === 'userData' ? '/tmp/upeer-multiprocess' : process.cwd()),
    getAppPath: () => process.cwd(),
    getName: () => 'Revelnest Desktop',
    getVersion: () => '1.2.0',
    getLocale: () => 'es-ES',
    getPreferredSystemLanguages: () => ['es-ES'],
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    on: (event, listener) => {
        const listeners = appListeners.get(event) ?? [];
        listeners.push(listener);
        appListeners.set(event, listeners);
        return app;
    },
    once: (event, listener) => app.on(event, listener),
    quit: () => undefined,
    requestSingleInstanceLock: () => true,
    releaseSingleInstanceLock: () => undefined,
    setAppUserModelId: () => undefined,
};

export class BrowserWindow {
    constructor() {
        this.webContents = {
            send: (channel, payload) => {
                const target = (globalThis.__sentEvents__ || (globalThis.__sentEvents__ = []));
                target.push({ channel, payload });
            },
            isDestroyed: () => false,
        };
        this.isDestroyed = () => false;
    }
    static getAllWindows() {
        return [];
    }
    loadURL() {
        return Promise.resolve();
    }
    loadFile() {
        return Promise.resolve();
    }
    show() {
        return undefined;
    }
    hide() {
        return undefined;
    }
    destroy() {
        return undefined;
    }
    on() {
        return undefined;
    }
    once() {
        return undefined;
    }
    getBounds() {
        return { x: 0, y: 0, width: 800, height: 600 };
    }
}

export const ipcMain = {
    handle: () => undefined,
    on: () => undefined,
};

export const dialog = {
    showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
    showMessageBox: () => Promise.resolve({ response: 0 }),
};

export const shell = { openExternal: () => Promise.resolve() };

export function Notification() {
    return { show: () => undefined, close: () => undefined };
}

export const nativeImage = {
    createFromPath: () => ({ resize: () => ({ toDataURL: () => '' }) }),
    createEmpty: () => ({ resize: () => ({ toDataURL: () => '' }) }),
};

export const screen = {
    getPrimaryDisplay: () => ({ workAreaSize: { width: 800, height: 600 } }),
};

export const Menu = {
    buildFromTemplate: () => ({ popup: () => undefined }),
};

export const Tray = class Tray {
    constructor() {
        return undefined;
    }
    setToolTip() {
        return undefined;
    }
    setContextMenu() {
        return undefined;
    }
    destroy() {
        return undefined;
    }
};

export const powerMonitor = { on: () => undefined, getSystemIdleTime: () => 0 };

export const session = {
    defaultSession: { webRequest: { onBeforeSendHeaders: () => undefined, onHeadersReceived: () => undefined } },
};

export const systemPreferences = { getMediaAccessStatus: () => 'not-determined' };

export const globalShortcut = { register: () => true, unregisterAll: () => undefined };

export const protocol = {
    handle: () => undefined,
    unhandle: () => undefined,
    registerSchemesAsPrivileged: () => undefined,
};

export const desktopCapturer = {
    getSources: () => Promise.resolve([]),
};

export const clipboard = {
    readText: () => '',
    writeText: () => undefined,
    readImage: () => ({ isEmpty: () => true }),
    writeImage: () => undefined,
    clear: () => undefined,
};

export const ipcRenderer = {
    invoke: () => Promise.resolve(undefined),
    send: () => undefined,
    on: () => undefined,
    once: () => undefined,
    removeListener: () => undefined,
};

export const contextBridge = {
    exposeInMainWorld: () => undefined,
};

export const webUtils = {
    getPathForFile: (file) => file?.path ?? '',
};

class MessagePortMain {
    constructor() {
        this.peer = null;
        this.listeners = new Map();
    }

    on(event, listener) {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        return this;
    }

    once(event, listener) {
        const wrapped = (payload) => {
            this.removeListener(event, wrapped);
            listener(payload);
        };
        return this.on(event, wrapped);
    }

    removeListener(event, listener) {
        const listeners = this.listeners.get(event);
        if (!listeners) return this;
        this.listeners.set(event, listeners.filter((candidate) => candidate !== listener));
        return this;
    }

    start() {
        return undefined;
    }

    close() {
        return undefined;
    }

    postMessage(message, transfer = []) {
        queueMicrotask(() => this.peer?.dispatch({ data: message, ports: transfer }));
    }

    dispatch(event) {
        for (const listener of this.listeners.get('message') ?? []) listener(event);
    }
}

export class MessageChannelMain {
    constructor() {
        this.port1 = new MessagePortMain();
        this.port2 = new MessagePortMain();
        this.port1.peer = this.port2;
        this.port2.peer = this.port1;
    }
}

function createUtilityProcess() {
    const listeners = new Map();
    const worker = {
        pid: process.pid,
        on: (event, listener) => {
            const eventListeners = listeners.get(event) ?? [];
            eventListeners.push(listener);
            listeners.set(event, eventListeners);
            return worker;
        },
        once: (event, listener) => worker.on(event, listener),
        removeListener: (event, listener) => {
            const eventListeners = listeners.get(event);
            if (eventListeners) listeners.set(event, eventListeners.filter((candidate) => candidate !== listener));
            return worker;
        },
        postMessage: (message, transfer = []) => {
            queueMicrotask(() => {
                if (message?.type === 'connect') {
                    connectMediaVerifier(transfer[0]);
                    return;
                }
                for (const listener of listeners.get('message') ?? []) listener({ data: message, ports: transfer });
            });
        },
        kill: () => {
            for (const listener of listeners.get('exit') ?? []) listener(0);
        },
    };
    return worker;
}

export const utilityProcess = {
    fork: () => createUtilityProcess(),
};
