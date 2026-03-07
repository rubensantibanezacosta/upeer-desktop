"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("revelnest", {
  getMyNetworkAddress: () => electron.ipcRenderer.invoke("get-ygg-ip"),
  getMessages: (revelnestId) => electron.ipcRenderer.invoke("get-messages", revelnestId),
  getContacts: () => electron.ipcRenderer.invoke("get-contacts"),
  addContact: (address, name) => electron.ipcRenderer.invoke("add-contact", { address, name }),
  acceptContactRequest: (revelnestId, publicKey) => electron.ipcRenderer.invoke("accept-contact-request", { revelnestId, publicKey }),
  deleteContact: (revelnestId) => electron.ipcRenderer.invoke("delete-contact", { revelnestId }),
  sendMessage: (revelnestId, message, replyTo) => electron.ipcRenderer.invoke("send-p2p-message", { revelnestId, message, replyTo }),
  sendTypingIndicator: (revelnestId) => electron.ipcRenderer.invoke("send-typing-indicator", { revelnestId }),
  sendReadReceipt: (revelnestId, id) => electron.ipcRenderer.invoke("send-read-receipt", { revelnestId, id }),
  sendContactCard: (targetRevelnestId, contact) => electron.ipcRenderer.invoke("send-contact-card", { targetRevelnestId, contact }),
  sendChatReaction: (revelnestId, msgId, emoji, remove) => electron.ipcRenderer.invoke("send-chat-reaction", { revelnestId, msgId, emoji, remove }),
  sendChatUpdate: (revelnestId, msgId, newContent) => electron.ipcRenderer.invoke("send-chat-update", { revelnestId, msgId, newContent }),
  sendChatDelete: (revelnestId, msgId) => electron.ipcRenderer.invoke("send-chat-delete", { revelnestId, msgId }),
  getMyIdentity: () => electron.ipcRenderer.invoke("get-my-identity"),
  openFileDialog: (options) => electron.ipcRenderer.invoke("open-file-dialog", options || {}),
  readFileAsBase64: (filePath, maxSizeMB) => electron.ipcRenderer.invoke("read-file-as-base64", { filePath, maxSizeMB }),
  getPathForFile: (file) => electron.webUtils.getPathForFile(file),
  onReceive: (callback) => {
    electron.ipcRenderer.removeAllListeners("receive-p2p-message");
    electron.ipcRenderer.on("receive-p2p-message", (event, data) => callback(data));
  },
  onPresence: (callback) => {
    electron.ipcRenderer.on("contact-presence", (event, data) => callback(data));
  },
  onContactRequest: (callback) => {
    electron.ipcRenderer.on("contact-request-received", (event, data) => callback(data));
  },
  onHandshakeFinished: (callback) => {
    electron.ipcRenderer.on("contact-handshake-finished", (event, data) => callback(data));
  },
  onContactUntrustworthy: (callback) => {
    electron.ipcRenderer.on("contact-untrustworthy", (event, data) => callback(data));
  },
  onMessageDelivered: (callback) => {
    electron.ipcRenderer.on("message-delivered", (event, data) => callback(data));
  },
  onMessageRead: (callback) => {
    electron.ipcRenderer.on("message-read", (event, data) => callback(data));
  },
  onMessageReactionUpdated: (callback) => {
    electron.ipcRenderer.on("message-reaction-updated", (event, data) => callback(data));
  },
  onMessageUpdated: (callback) => {
    electron.ipcRenderer.on("message-updated", (event, data) => callback(data));
  },
  onMessageDeleted: (callback) => {
    electron.ipcRenderer.on("message-deleted", (event, data) => callback(data));
  },
  onTyping: (callback) => {
    electron.ipcRenderer.on("peer-typing", (event, data) => callback(data));
  },
  // File transfer API (Phase 16)
  startFileTransfer: (revelnestId, filePath, thumbnail) => electron.ipcRenderer.invoke("start-file-transfer", { revelnestId, filePath, thumbnail }),
  cancelFileTransfer: (fileId, reason) => electron.ipcRenderer.invoke("cancel-file-transfer", { fileId, reason: reason || "User cancelled" }),
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
  }
});
