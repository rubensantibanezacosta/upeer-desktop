import { mock } from 'node:test';

// 1. Mock Electron BEFORE importing anything that uses it
// This matches the static imports in server.ts and handlers.ts
mock.module('electron', {
    namedExports: {
        app: {
            getPath: () => './test-data',
            on: () => { },
            isPackaged: false
        },
        BrowserWindow: class {
            webContents = { send: () => { } };
            loadURL = () => { };
        },
        ipcMain: { on: () => { }, handle: () => { } }
    }
});

// 2. Import the tests now that mocks are set up
import './vault-erasure.test.ts';
import './vault-integration.test.ts';
