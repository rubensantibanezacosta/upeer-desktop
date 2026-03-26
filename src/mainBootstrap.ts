import { app, protocol } from 'electron';
import { registerContactHandlers } from './main_process/core/ipcHandlers/contacts.js';
import { registerDeviceHandlers } from './main_process/core/ipcHandlers/devices.js';
import { registerFileHandlers } from './main_process/core/ipcHandlers/files.js';
import { registerFileTransferHandlers } from './main_process/core/ipcHandlers/fileTransfer.js';
import { registerGroupHandlers } from './main_process/core/ipcHandlers/groups.js';
import { registerIdentityHandlers } from './main_process/core/ipcHandlers/identity.js';
import { registerMessageHandlers } from './main_process/core/ipcHandlers/messages.js';
import { registerNetworkHandlers } from './main_process/core/ipcHandlers/network.js';
import { registerSecurityHandlers } from './main_process/core/ipcHandlers/security.js';
import { registerVaultHandlers } from './main_process/core/ipcHandlers/vault.js';

export const registerMediaScheme = () => {
    protocol.registerSchemesAsPrivileged([
        { scheme: 'media', privileges: { stream: true, bypassCSP: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
    ]);
};

export const configureLinuxMediaSupport = () => {
    if (process.platform !== 'linux') {
        return;
    }
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu-rasterization');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
};

export const registerIpcHandlers = () => {
    registerNetworkHandlers();
    registerContactHandlers();
    registerMessageHandlers();
    registerGroupHandlers();
    registerIdentityHandlers();
    registerFileHandlers();
    registerFileTransferHandlers();
    registerVaultHandlers();
    registerSecurityHandlers();
    registerDeviceHandlers();
};