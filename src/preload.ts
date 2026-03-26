import { contextBridge } from 'electron';
import { buildPreloadBridge } from './preloadBridge.js';

contextBridge.exposeInMainWorld('upeer', buildPreloadBridge());
