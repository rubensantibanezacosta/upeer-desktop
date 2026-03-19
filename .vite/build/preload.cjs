"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("upeer", {
  getMyNetworkAddress: () => electron.ipcRenderer.invoke("get-ygg-ip"),
  getMyIdentity: () => electron.ipcRenderer.invoke("get-my-identity"),
  getVaultStats: () => electron.ipcRenderer.invoke("get-vault-stats"),
  // Identity / Wallet Auth
  identityStatus: () => electron.ipcRenderer.invoke("identity-status"),
  generateMnemonic: () => electron.ipcRenderer.invoke("generate-mnemonic"),
  getMnemonic: (pin) => electron.ipcRenderer.invoke("get-mnemonic", { pin }),
  createMnemonicIdentity: (mnemonic, alias, avatar) => electron.ipcRenderer.invoke("create-mnemonic-identity", { mnemonic, alias, avatar }),
  unlockSession: (mnemonic) => electron.ipcRenderer.invoke("unlock-session", { mnemonic }),
  lockSession: () => electron.ipcRenderer.invoke("lock-session"),
  setMyAlias: (alias) => electron.ipcRenderer.invoke("set-my-alias", { alias }),
  setMyAvatar: (avatar) => electron.ipcRenderer.invoke("set-my-avatar", { avatar }),
  getMyReputation: () => electron.ipcRenderer.invoke("get-my-reputation"),
  addContact: (address, name) => electron.ipcRenderer.invoke("add-contact", { address, name }),
  acceptContactRequest: (upeerId, publicKey) => electron.ipcRenderer.invoke("accept-contact-request", { upeerId, publicKey }),
  deleteContact: (upeerId) => electron.ipcRenderer.invoke("delete-contact", { upeerId }),
  blockContact: (upeerId) => electron.ipcRenderer.invoke("block-contact", { upeerId }),
  unblockContact: (upeerId) => electron.ipcRenderer.invoke("unblock-contact", { upeerId }),
  clearChat: (upeerId) => electron.ipcRenderer.invoke("clear-chat", { upeerId }),
  getBlockedContacts: () => electron.ipcRenderer.invoke("get-blocked-contacts"),
  sendMessage: (upeerId, message, replyTo) => electron.ipcRenderer.invoke("send-p2p-message", { upeerId, message, replyTo }),
  sendTypingIndicator: (upeerId) => electron.ipcRenderer.invoke("send-typing-indicator", { upeerId }),
  sendReadReceipt: (upeerId, id) => electron.ipcRenderer.invoke("send-read-receipt", { upeerId, id }),
  sendContactCard: (targetUpeerId, contact) => electron.ipcRenderer.invoke("send-contact-card", { targetUpeerId, contact }),
  sendChatReaction: (upeerId, msgId, emoji, remove) => electron.ipcRenderer.invoke("send-chat-reaction", { upeerId, msgId, emoji, remove }),
  sendChatUpdate: (upeerId, msgId, newContent) => electron.ipcRenderer.invoke("send-chat-update", { upeerId, msgId, newContent }),
  sendChatDelete: (upeerId, msgId) => electron.ipcRenderer.invoke("send-chat-delete", { upeerId, msgId }),
  getMessages: (upeerId) => electron.ipcRenderer.invoke("get-messages", upeerId),
  getContacts: () => electron.ipcRenderer.invoke("get-contacts"),
  // Multi-device API
  getDevices: () => electron.ipcRenderer.invoke("get-devices"),
  setDeviceTrust: (deviceId, isTrusted) => electron.ipcRenderer.invoke("set-device-trust", { deviceId, isTrusted }),
  deleteDevice: (deviceId) => electron.ipcRenderer.invoke("delete-device", { deviceId }),
  // Group API
  getGroups: () => electron.ipcRenderer.invoke("get-groups"),
  createGroup: (name, memberUpeerIds, avatar) => electron.ipcRenderer.invoke("create-group", { name, memberUpeerIds, avatar }),
  updateGroupAvatar: (groupId, avatar) => electron.ipcRenderer.invoke("update-group-avatar", { groupId, avatar }),
  sendGroupMessage: (groupId, message, replyTo) => electron.ipcRenderer.invoke("send-group-message", { groupId, message, replyTo }),
  inviteToGroup: (groupId, upeerId) => electron.ipcRenderer.invoke("invite-to-group", { groupId, upeerId }),
  updateGroup: (groupId, fields) => electron.ipcRenderer.invoke("update-group", { groupId, ...fields }),
  leaveGroup: (groupId) => electron.ipcRenderer.invoke("leave-group", { groupId }),
  onGroupUpdated: (callback) => {
    electron.ipcRenderer.removeAllListeners("group-updated");
    electron.ipcRenderer.on("group-updated", (event, data) => callback(data));
  },
  onGroupMessage: (callback) => {
    electron.ipcRenderer.removeAllListeners("receive-group-message");
    electron.ipcRenderer.on("receive-group-message", (event, data) => callback(data));
  },
  onGroupInvite: (callback) => {
    electron.ipcRenderer.removeAllListeners("group-invite-received");
    electron.ipcRenderer.on("group-invite-received", (event, data) => callback(data));
  },
  onGroupMessageDelivered: (callback) => {
    electron.ipcRenderer.removeAllListeners("group-message-delivered");
    electron.ipcRenderer.on("group-message-delivered", (event, data) => callback(data));
  },
  openFileDialog: (options) => electron.ipcRenderer.invoke("open-file-dialog", options || {}),
  persistInternalAsset: (args) => electron.ipcRenderer.invoke("persist-internal-asset", args),
  readFileAsBase64: (filePath, maxSizeMB) => electron.ipcRenderer.invoke("read-file-as-base64", { filePath, maxSizeMB }),
  getPathForFile: (file) => electron.webUtils.getPathForFile(file),
  onReceive: (callback) => {
    electron.ipcRenderer.removeAllListeners("receive-p2p-message");
    electron.ipcRenderer.on("receive-p2p-message", (event, data) => callback(data));
  },
  onPresence: (callback) => {
    electron.ipcRenderer.removeAllListeners("contact-presence");
    electron.ipcRenderer.on("contact-presence", (event, data) => callback(data));
  },
  onContactRequest: (callback) => {
    electron.ipcRenderer.removeAllListeners("contact-request-received");
    electron.ipcRenderer.on("contact-request-received", (event, data) => callback(data));
  },
  onHandshakeFinished: (callback) => {
    electron.ipcRenderer.removeAllListeners("contact-handshake-finished");
    electron.ipcRenderer.on("contact-handshake-finished", (event, data) => callback(data));
  },
  onContactUntrustworthy: (callback) => {
    electron.ipcRenderer.removeAllListeners("contact-untrustworthy");
    electron.ipcRenderer.on("contact-untrustworthy", (event, data) => callback(data));
  },
  /** ⚠️ TOFU: la clave criptográfica estática de un contacto cambió.
   *  El UI debe mostrar una alerta prominente para que el usuario verifique
   *  la nueva huella digital por un canal alternativo (llamada, señal física, etc.).
   *  data: { upeerId, oldFingerprint, newFingerprint, alias }
   */
  onKeyChangeAlert: (callback) => {
    electron.ipcRenderer.removeAllListeners("key-change-alert");
    electron.ipcRenderer.on("key-change-alert", (event, data) => callback(data));
  },
  onMessageDelivered: (callback) => {
    electron.ipcRenderer.removeAllListeners("message-delivered");
    electron.ipcRenderer.on("message-delivered", (event, data) => callback(data));
  },
  onMessageRead: (callback) => {
    electron.ipcRenderer.removeAllListeners("message-read");
    electron.ipcRenderer.on("message-read", (event, data) => callback(data));
  },
  onMessageReactionUpdated: (callback) => {
    electron.ipcRenderer.removeAllListeners("message-reaction-updated");
    electron.ipcRenderer.on("message-reaction-updated", (event, data) => callback(data));
  },
  onMessageUpdated: (callback) => {
    electron.ipcRenderer.removeAllListeners("message-updated");
    electron.ipcRenderer.on("message-updated", (event, data) => callback(data));
  },
  onMessageDeleted: (callback) => {
    electron.ipcRenderer.removeAllListeners("message-deleted");
    electron.ipcRenderer.on("message-deleted", (event, data) => callback(data));
  },
  onChatCleared: (callback) => {
    electron.ipcRenderer.removeAllListeners("chat-cleared");
    electron.ipcRenderer.on("chat-cleared", (event, data) => callback(data));
  },
  onMessageStatusUpdated: (callback) => {
    electron.ipcRenderer.removeAllListeners("message-status-updated");
    electron.ipcRenderer.on("message-status-updated", (event, data) => callback(data));
  },
  onTyping: (callback) => {
    electron.ipcRenderer.removeAllListeners("peer-typing");
    electron.ipcRenderer.on("peer-typing", (event, data) => callback(data));
  },
  // File transfer API (Phase 16)
  startFileTransfer: (upeerId, filePath, thumbnail, caption) => electron.ipcRenderer.invoke("start-file-transfer", { upeerId, filePath, thumbnail, caption }),
  cancelFileTransfer: (fileId, reason) => electron.ipcRenderer.invoke("cancel-file-transfer", { fileId, reason: reason || "User cancelled" }),
  retryFileTransfer: (fileId) => electron.ipcRenderer.invoke("retry-file-transfer", { fileId }),
  getFileTransfers: () => electron.ipcRenderer.invoke("get-file-transfers"),
  saveTransferredFile: (fileId, destinationPath) => electron.ipcRenderer.invoke("save-transferred-file", { fileId, destinationPath }),
  onFileTransferStarted: (callback) => {
    electron.ipcRenderer.removeAllListeners("file-transfer-started");
    electron.ipcRenderer.on("file-transfer-started", (event, data) => callback(data));
  },
  onFileTransferProgress: (callback) => {
    electron.ipcRenderer.removeAllListeners("file-transfer-progress");
    electron.ipcRenderer.on("file-transfer-progress", (event, data) => callback(data));
  },
  onFileTransferCompleted: (callback) => {
    electron.ipcRenderer.removeAllListeners("file-transfer-completed");
    electron.ipcRenderer.on("file-transfer-completed", (event, data) => callback(data));
  },
  onFileTransferCancelled: (callback) => {
    electron.ipcRenderer.removeAllListeners("file-transfer-cancelled");
    electron.ipcRenderer.on("file-transfer-cancelled", (event, data) => callback(data));
  },
  onFileTransferFailed: (callback) => {
    electron.ipcRenderer.removeAllListeners("file-transfer-failed");
    electron.ipcRenderer.on("file-transfer-failed", (event, data) => callback(data));
  },
  /**
   * Se invoca cuando el sidecar yggstack detecta y comunica la dirección
   * IPv6 asignada en la red Yggdrasil (rango 200::/7). El renderer puede
   * mostrarla como "ID de chat" o dirección de conexión del usuario.
   * El evento se emite una sola vez por sesión (cuando yggstack arranca).
   */
  getNetworkStats: () => electron.ipcRenderer.invoke("get-network-stats"),
  restartYggstack: () => electron.ipcRenderer.invoke("restart-yggstack"),
  // BUG EC fix: diálogo nativo "Guardar como" para que el renderer pueda
  // pedir al usuario dónde guardar un archivo recibido.
  showSaveDialog: (options) => electron.ipcRenderer.invoke("show-save-dialog", options),
  // BUG EC fix: abrir un archivo ya guardado con la app predeterminada del SO.
  openFile: (filePath) => electron.ipcRenderer.invoke("open-file", { filePath }),
  onYggstackAddress: (callback) => {
    electron.ipcRenderer.removeAllListeners("yggstack-address");
    electron.ipcRenderer.on("yggstack-address", (_event, address) => callback(address));
  },
  /** Callback para cambios de estado de la red Yggdrasil: 'connecting'|'up'|'down'|'reconnecting' */
  onYggstackStatus: (callback) => {
    electron.ipcRenderer.removeAllListeners("yggstack-status");
    electron.ipcRenderer.on("yggstack-status", (_event, status, address) => callback(status, address));
  },
  // BUG FIX: Generador de miniaturas nativo
  generateVideoThumbnail: (filePath) => electron.ipcRenderer.invoke("generate-video-thumbnail", { filePath }),
  getMyDevices: () => electron.ipcRenderer.invoke("get-my-devices"),
  // PIN / Local security
  isPinEnabled: () => electron.ipcRenderer.invoke("is-pin-enabled"),
  setPin: (args) => electron.ipcRenderer.invoke("set-pin", args),
  disablePin: (args) => electron.ipcRenderer.invoke("disable-pin", args),
  verifyPin: (args) => electron.ipcRenderer.invoke("verify-pin", args)
});
