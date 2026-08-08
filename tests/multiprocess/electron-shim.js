export const app = {
    isPackaged: false,
    getPath: () => '/tmp/upeer-multiprocess',
    getAppPath: () => '/tmp/upeer-multiprocess',
    getName: () => 'Revelnest Desktop',
    getVersion: () => '1.2.0',
};

export class BrowserWindow {
    constructor() {
        this.webContents = { send: () => undefined, isDestroyed: () => false };
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

