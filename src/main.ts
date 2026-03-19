import { app, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import started from 'electron-squirrel-startup';

// Registrar el esquema como privilegiado para permitir streaming (range requests)
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

// BUG FIX: Deshabilitar aceleración de hardware en Linux para corregir
// el problema de "pantalla negra" en reproducción de video y previsualizaciones.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
  // Switches adicionales para estabilidad en Linux y soporte de codecs en MKV
  app.commandLine.appendSwitch('disable-gpu-rasterization');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  // BUG FIX MKV: Forzar el soporte de codecs adicionales y evitar que Chromium bloquee streams locales
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

// Configuración de proceso
import { setupProcessHandlers } from './main_process/core/processConfig.js';

// Inicialización de la aplicación
import { initializeApp } from './main_process/core/appInitializer.js';

// Manejadores de ciclo de vida
import { setupAppLifecycleHandlers } from './main_process/core/appLifecycle.js';

// Registradores de handlers IPC
import { registerNetworkHandlers } from './main_process/core/ipcHandlers/network.js';
import { registerContactHandlers } from './main_process/core/ipcHandlers/contacts.js';
import { registerMessageHandlers } from './main_process/core/ipcHandlers/messages.js';
import { registerGroupHandlers } from './main_process/core/ipcHandlers/groups.js';
import { registerIdentityHandlers } from './main_process/core/ipcHandlers/identity.js';
import { registerFileHandlers } from './main_process/core/ipcHandlers/files.js';
import { registerFileTransferHandlers } from './main_process/core/ipcHandlers/fileTransfer.js';
import { registerVaultHandlers } from './main_process/core/ipcHandlers/vault.js';
import { registerSecurityHandlers } from './main_process/core/ipcHandlers/security.js';
import { registerDeviceHandlers } from './main_process/core/ipcHandlers/devices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Si estamos en modo de instalación de squirrel, salir
if (started) {
  app.quit();
}

// Configurar manejadores de errores y proceso
setupProcessHandlers();

// Registrar todos los manejadores IPC
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

// Configurar manejadores de ciclo de vida de la aplicación
setupAppLifecycleHandlers();

// Inicializar la aplicación cuando Electron esté listo
app.on('ready', () => initializeApp(__dirname));