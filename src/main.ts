import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import started from 'electron-squirrel-startup';
import { setupProcessHandlers } from './main_process/core/processConfig.js';
import { initializeApp } from './main_process/core/appInitializer.js';
import { setupAppLifecycleHandlers } from './main_process/core/appLifecycle.js';
import { configureLinuxMediaSupport, registerIpcHandlers, registerMediaScheme } from './mainBootstrap.js';

registerMediaScheme();
configureLinuxMediaSupport();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (started) {
  app.quit();
}

setupProcessHandlers();
registerIpcHandlers();
setupAppLifecycleHandlers();
app.on('ready', () => initializeApp(__dirname));