import { app, protocol } from 'electron';
import { registerContactHandlers } from './main_process/core/ipcHandlers/contacts.js';
import { registerCallHandlers } from './main_process/core/ipcHandlers/calls.js';
import { registerClipboardHandlers } from './main_process/core/ipcHandlers/clipboard.js';
import { registerDeviceHandlers } from './main_process/core/ipcHandlers/devices.js';
import { registerEnrollmentHandlers } from './main_process/core/ipcHandlers/enrollment.js';
import { registerSyncHandlers } from './main_process/core/ipcHandlers/sync.js';
import { registerFileHandlers } from './main_process/core/ipcHandlers/files.js';
import { registerFileTransferHandlers } from './main_process/core/ipcHandlers/fileTransfer.js';
import { registerGroupHandlers } from './main_process/core/ipcHandlers/groups.js';
import { registerIdentityHandlers } from './main_process/core/ipcHandlers/identity.js';
import { registerMessageHandlers } from './main_process/core/ipcHandlers/messages.js';
import { registerNetworkHandlers } from './main_process/core/ipcHandlers/network.js';
import { registerPrivacyHandlers } from './main_process/core/ipcHandlers/privacy.js';
import { registerNotificationHandlers } from './main_process/core/ipcHandlers/notifications.js';
import { registerRetentionHandlers } from './main_process/core/ipcHandlers/retention.js';
import { registerSecurityHandlers } from './main_process/core/ipcHandlers/security.js';
import { registerScreenShareHandlers } from './main_process/core/ipcHandlers/screenShare.js';
import { registerVaultHandlers } from './main_process/core/ipcHandlers/vault.js';
import { registerStorageHandlers } from './main_process/core/ipcHandlers/storage.js';

export const registerMediaScheme = () => {
    protocol.registerSchemesAsPrivileged([
        { scheme: 'media', privileges: { stream: true, bypassCSP: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
    ]);
};

export const configureLinuxMediaSupport = () => {
    if (process.platform !== 'linux') {
        return;
    }
    // Sin aceleración por hardware (obligatorio en Linux) los decodificadores VAAPI
    // no pueden activarse: declararlos deja al compositor sin frames y la ventana
    // se queda en negro. No se añaden aquí.
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu-rasterization');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
};

export const registerIpcHandlers = () => {
    registerClipboardHandlers();
    registerNetworkHandlers();
    registerContactHandlers();
    registerCallHandlers();
    registerMessageHandlers();
    registerGroupHandlers();
    registerIdentityHandlers();
    registerFileHandlers();
    registerFileTransferHandlers();
    registerVaultHandlers();
    registerStorageHandlers();
    registerSecurityHandlers();
    registerPrivacyHandlers();
    registerNotificationHandlers();
    registerRetentionHandlers();
    registerDeviceHandlers();
    registerEnrollmentHandlers();
    registerSyncHandlers();
    registerScreenShareHandlers();
};