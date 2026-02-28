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
  getMyIdentity: () => electron.ipcRenderer.invoke("get-my-identity"),
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
  onMessageDelivered: (callback) => {
    electron.ipcRenderer.on("message-delivered", (event, data) => callback(data));
  },
  onMessageRead: (callback) => {
    electron.ipcRenderer.on("message-read", (event, data) => callback(data));
  },
  onTyping: (callback) => {
    electron.ipcRenderer.on("peer-typing", (event, data) => callback(data));
  }
});
