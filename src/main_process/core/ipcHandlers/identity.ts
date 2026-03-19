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
  unlockWithMnemonic,
  lockSession,
  isSessionLocked,
  isMnemonicMode,
  getMnemonic,
  sign
} from '../../security/identity.js';
import { verifyAccessPin } from '../../security/pin.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { getVouchScore } from '../../security/reputation/vouches.js';
import { closeUDPServer, startUDPServer } from '../../network/server/tcpServer.js';
import { stopPeerManager } from '../../sidecars/peer-manager.js';
import { stopLanDiscovery, startLanDiscovery } from '../../network/lan/discovery.js';
import { clearUserData } from '../../storage/shared.js';
import { getMainWindow } from '../windowManager.js';
import { warn } from '../../security/secure-logger.js';

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

  ipcMain.handle('get-mnemonic', (event, { pin }) => {
    // Verificación obligatoria de PIN para exponer el mnemonic
    // BUG FIX: El PIN viene como 'pin' en el objeto desestructurado
    if (!verifyAccessPin(pin)) {
      warn('Intento fallido de ver mnemonic: PIN incorrecto', {}, 'security');
      return { success: false, error: 'PIN incorrecto' };
    }
    const mnemonic = getMnemonic();
    if (!mnemonic) {
      return { success: false, error: 'No hay mnemonic en la sesión activa' };
    }
    return { success: true, mnemonic };
  });

  ipcMain.handle('set-my-alias', async (event, { alias }) => {
    // BUG DS fix: limitar longitud del alias para evitar consumo excesivo de memoria/disco
    const sanitized = typeof alias === 'string' ? alias.slice(0, 100) : '';
    setMyAlias(sanitized);

    // Propagar cambio a la flota propia y red (DHT)
    const myId = getMyUPeerId();
    const myPk = getMyPublicKeyHex();
    const avatar = getMyAvatar();

    const payload = { alias: sanitized, avatar, updatedAt: Date.now() };
    const { canonicalStringify } = await import('../../network/utils.js');
    const signature = sign(Buffer.from(canonicalStringify(payload))).toString('hex');

    // 1. Guardar en DHT para que otros (amigos) lo vean al buscarnos
    const { getKademliaInstance } = await import('../../network/dht/handlers.js');
    const kademlia = getKademliaInstance();
    if (kademlia) {
      kademlia.storeLocationBlock(myId, { ...payload, publicKey: myPk, signature });

      // 2. Fan-out UDP a dispositivos propios online
      const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
      const selfNodes = kademlia.findClosestContacts(myId, 20)
        .filter(n => n.upeerId === myId && n.address !== myYggAddress);

      const syncPacket = { type: 'IDENTITY_UPDATE', ...payload, signature };
      for (const node of selfNodes) {
        const { sendSecureUDPMessage } = await import('../../network/server/transport.js');
        sendSecureUDPMessage(node.address, syncPacket, myPk);
      }
    }

    return { success: true };
  });

  ipcMain.handle('set-my-avatar', async (event, { avatar }) => {
    // BUG DS fix: limitar a ~2 MB (base64 de imagen). >2 MB rechazado.
    if (typeof avatar === 'string' && avatar.length > 2_000_000) {
      return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
    }
    setMyAvatar(avatar ?? '');

    // Propagar cambio
    const myId = getMyUPeerId();
    const myPk = getMyPublicKeyHex();
    const alias = getMyAlias();

    const payload = { alias, avatar, updatedAt: Date.now() };
    const { canonicalStringify } = await import('../../network/utils.js');
    const signature = sign(Buffer.from(canonicalStringify(payload))).toString('hex');

    const { getKademliaInstance } = await import('../../network/dht/handlers.js');
    const kademlia = getKademliaInstance();
    if (kademlia) {
      kademlia.storeLocationBlock(myId, { ...payload, publicKey: myPk, signature });

      const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
      const selfNodes = kademlia.findClosestContacts(myId, 20)
        .filter(n => n.upeerId === myId && n.address !== myYggAddress);

      const syncPacket = { type: 'IDENTITY_UPDATE', ...payload, signature };
      for (const node of selfNodes) {
        const { sendSecureUDPMessage } = await import('../../network/server/transport.js');
        sendSecureUDPMessage(node.address, syncPacket, myPk);
      }
    }

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
    const mnemonicToUse = mnemonic || generateMnemonic();
    const success = unlockWithMnemonic(mnemonicToUse);
    if (success) {
      if (alias) setMyAlias(alias);
      if (avatar) setMyAvatar(avatar);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        startUDPServer(mainWindow);
        try { await startLanDiscovery(); } catch (e) { /* ignore */ }
      }
      return { success: true, mnemonic: mnemonicToUse };
    }
    return { success: false, error: 'Identity initialization failed' };
  });

  ipcMain.handle('unlock-session', async (event, { mnemonic }) => {
    const successResult = await unlockWithMnemonic(mnemonic);
    if (successResult) {
      // Kick off network services now that we have a valid identity
      const mainWindow = getMainWindow();
      if (mainWindow) startUDPServer(mainWindow);
      try { await startLanDiscovery(); } catch (e) { /* ignore if already started */ }
      return { success: true };
    }
    return { success: false, error: 'Mnemonic unlock failed' };
  });

  ipcMain.handle('lock-session', () => {
    lockSession();
    return { success: true };
  });
}