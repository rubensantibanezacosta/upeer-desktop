import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import started from 'electron-squirrel-startup';

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

// Configurar manejadores de ciclo de vida de la aplicación
setupAppLifecycleHandlers();

// Inicializar la aplicación cuando Electron esté listo
app.on('ready', () => initializeApp(__dirname));