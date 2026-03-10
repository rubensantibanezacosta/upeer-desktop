import { ipcMain } from 'electron';
import { getYggstackAddress } from '../../sidecars/yggstack.js';
import {
  getMyUPeerId,
  getMyPublicKeyHex,
  getMyAlias,
  setMyAlias,
  getMyAvatar,
  setMyAvatar,
  generateMnemonic,
  createMnemonicIdentity,
  unlockWithMnemonic,
  lockSession,
  isSessionLocked,
  isMnemonicMode
} from '../../security/identity.js';
import { getContacts } from '../../storage/db.js';
import { getVouchScore } from '../../security/reputation/vouches.js';
import { closeUDPServer, startUDPServer } from '../../network/server/index.js';
import { stopPeerManager } from '../../sidecars/peer-manager.js';
import { stopLanDiscovery, startLanDiscovery } from '../../network/lan/discovery.js';
import { clearUserData } from '../../storage/db.js';
import { getMainWindow } from '../windowManager.js';

/**
 * Registra los manejadores IPC relacionados con identidad y autenticación
 */
export function registerIdentityHandlers(): void {
  ipcMain.handle('get-my-identity', () => {
    // La dirección de identidad ahora proviene del sidecar yggstack (SOCKS5 user-space)
    // en lugar de la interfaz TUN/TAP del sistema operativo.
    const address = getYggstackAddress();
    if (isSessionLocked()) {
      return { address, upeerId: null, publicKey: null, alias: null, avatar: null };
    }
    return {
      address,
      upeerId: getMyUPeerId(),
      publicKey: getMyPublicKeyHex(),
      alias: getMyAlias(),
      avatar: getMyAvatar() || undefined
    };
  });

  ipcMain.handle('get-my-reputation', async () => {
    if (isSessionLocked()) return null;
    try {
      const myId = getMyUPeerId();
      const contacts = await getContacts();
      const connectedCount = (contacts as any[]).filter(c => c.status === 'connected').length;
      const vouchScore = await getVouchScore(myId);
      return { vouchScore, connectionCount: connectedCount };
    } catch {
      return { vouchScore: 50, connectionCount: 0 };
    }
  });

  // ── Identity / Wallet-style Auth API ───────────────────────
  ipcMain.handle('identity-status', () => ({
    isMnemonicMode: isMnemonicMode(),
    isLocked: isSessionLocked(),
    upeerId: !isSessionLocked() ? getMyUPeerId() : null,
  }));

  ipcMain.handle('generate-mnemonic', () => ({
    mnemonic: generateMnemonic(),
  }));

  ipcMain.handle('set-my-alias', (event, { alias }) => {
    // BUG DS fix: limitar longitud del alias para evitar consumo excesivo de memoria/disco
    const sanitized = typeof alias === 'string' ? alias.slice(0, 100) : '';
    setMyAlias(sanitized);
    return { success: true };
  });

  ipcMain.handle('set-my-avatar', (event, { avatar }) => {
    // BUG DS fix: limitar a ~2 MB (base64 de imagen). >2 MB rechazado.
    if (typeof avatar === 'string' && avatar.length > 2_000_000) {
      return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
    }
    setMyAvatar(avatar ?? '');
    return { success: true };
  });

  ipcMain.handle('create-mnemonic-identity', async (event, { mnemonic, alias, avatar }) => {
    // Si ya había una identidad activa (cambio de cuenta), cerrar la red y limpiar datos
    if (isMnemonicMode()) {
      closeUDPServer();
      stopPeerManager();
      stopLanDiscovery();
      clearUserData();
    }
    const result = await createMnemonicIdentity(mnemonic, alias, avatar);
    if (result.success) {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        startUDPServer(mainWindow);
        try { await startLanDiscovery(); } catch (e) { /* ignore */ }
      }
    }
    return result;
  });

  ipcMain.handle('unlock-session', async (event, { mnemonic }) => {
    const result = await unlockWithMnemonic(mnemonic);
    if (result.success) {
      // Kick off network services now that we have a valid identity
      const mainWindow = getMainWindow();
      if (mainWindow) startUDPServer(mainWindow);
      try { await startLanDiscovery(); } catch (e) { /* ignore if already started */ }
    }
    return result;
  });

  ipcMain.handle('lock-session', () => {
    lockSession();
    return { success: true };
  });
}