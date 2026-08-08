import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(__dirname, 'loader.js')).href);

const net = await import('node:net');
const fs = await import('node:fs');
const os = await import('node:os');

const identity = await import('../../src/main_process/security/identity.js');
const transport = await import('../../src/main_process/network/server/transport.js');
const state = await import('../../src/main_process/network/server/state.js');
const { initDB } = await import('../../src/main_process/storage/init.js');
const { handlePacket } = await import('../../src/main_process/network/handlers.js');
const contacts = await import('../../src/main_process/storage/contacts/operations.js');
const messages = await import('../../src/main_process/storage/messages/operations.js');
const { updateContactSignedPreKey } = await import('../../src/main_process/storage/contacts/keys.js');
const { sendUDPMessage } = await import('../../src/main_process/network/messaging/chatSend.js');
const { sendTypingIndicator } = await import('../../src/main_process/network/messaging/chatSend.js');
const { sendReadReceipt } = await import('../../src/main_process/network/messaging/chatInteractions.js');
const { createGroup, inviteToGroup } = await import('../../src/main_process/network/messaging/groupControl.js');
const { sendGroupMessage } = await import('../../src/main_process/network/messaging/groups.js');
const { getMessageStatus } = await import('../../src/main_process/storage/messages/status.js');
const { fileTransferManager } = await import('../../src/main_process/network/file-transfer/transfer-manager.js');
const { VaultManager } = await import('../../src/main_process/network/vault/manager.js');
const { BrowserWindow } = await import('electron');
const { getSqlite } = await import('../../src/main_process/storage/shared.js');
const { setKademliaInstance } = await import('../../src/main_process/network/dht/handlers.js');

const peerId = process.env.PEER_ID || '';
const mnemonic = process.env.PEER_MNEMONIC || null;
const port = Number(process.env.PEER_PORT);
const selfAddresses = JSON.parse(process.env.PEER_SELF_ADDRESSES || '[]');
const sourceDir = process.env.PEER_SOURCE_DIR || null;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), `upeer-mp-${peerId.replace(/[^a-z0-9]/gi, '')}-`));
identity.initIdentity(dir);
await initDB(dir);
if (sourceDir) {
    for (const fname of ['device.key', 'spk.enc', 'identity.enc', 'identity.mnemonic.enc', 'identity.mnemonic_mode']) {
        const src = path.join(sourceDir, fname);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, fname));
    }
}
if (mnemonic) {
    identity.unlockSession(mnemonic);
} else {
    identity.createMnemonicIdentity();
}

const myId = identity.getMyUPeerId();
const pubKey = identity.getMyPublicKeyHex();

if (selfAddresses.length > 0) {
    setKademliaInstance({
        findClosestContacts: () => selfAddresses.map((address) => ({ upeerId: myId, address })),
    });
}

state.setTcpServer({ listening: true });
state.setNetworkReady(true);

const sendResponse = (ip, data) => transport.sendSecureUDPMessage(ip, data);
fileTransferManager.initialize(sendResponse, new BrowserWindow());

const socketPeerIds = new Map();
const server = net.createServer((socket) => {
    let frameBuf = Buffer.alloc(0);
    let identified = false;
    let remotePeerId = null;
    socket.on('data', (chunk) => {
        frameBuf = Buffer.concat([frameBuf, chunk]);
        while (frameBuf.length >= 4) {
            const msgLen = frameBuf.readUInt32BE(0);
            if (frameBuf.length < 4 + msgLen) break;
            const msg = frameBuf.subarray(4, 4 + msgLen);
            frameBuf = frameBuf.subarray(4 + msgLen);
            if (!identified) {
                identified = true;
                remotePeerId = msg.toString();
                socketPeerIds.set(socket, remotePeerId);
                continue;
            }
            const rinfo = { address: remotePeerId || peerId, port: 50005 };
            let rxType = '';
            try {
                rxType = JSON.parse(msg.toString()).type ?? '';
            } catch {
                rxType = '(unparseable)';
            }
            process.send({ type: 'networkRx', peerId, rxType });
            void handlePacket(msg, rinfo, null, sendResponse, () => {});
        }
    });
});
await new Promise((res) => server.listen(port, '127.0.0.1', () => res()));

function reply(id, payload) {
    process.send({ type: 'reply', _id: id, ...payload });
}

process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object' || !msg.type) return;
    const run = async () => {
        switch (msg.type) {
            case 'sendMessage':
                await sendUDPMessage(msg.to, msg.content)
                    .then((result) => reply(msg._id, { ok: true, result }))
                    .catch((e) => reply(msg._id, { ok: false, error: String(e) }));
                break;
            case 'addPeer':
                contacts.addOrUpdateContact(msg.upeerId, msg.address, msg.upeerId, msg.publicKey, 'connected');
                reply(msg._id, { ok: true });
                break;
            case 'setSpk':
                updateContactSignedPreKey(msg.upeerId, msg.spkPub, msg.spkSig, msg.spkId);
                reply(msg._id, { ok: true });
                break;
            case 'setContactStatus':
                getSqlite()?.exec(`UPDATE contacts SET status = '${msg.status}' WHERE upeer_id = '${msg.upeerId}'`);
                reply(msg._id, { ok: true });
                break;
            case 'getMessages':
                reply(msg._id, { ok: true, messages: messages.getMessages(msg.contactId) });
                break;
            case 'getMnemonic':
                reply(msg._id, { ok: true, mnemonic: identity.getMnemonic() });
                break;
            case 'sendTyping':
                await sendTypingIndicator(msg.upeerId);
                reply(msg._id, { ok: true });
                break;
            case 'sendReadReceipt':
                await sendReadReceipt(msg.upeerId, msg.id);
                reply(msg._id, { ok: true });
                break;
            case 'createGroup':
                await createGroup(msg.name, msg.members)
                    .then((groupId) => reply(msg._id, { ok: true, groupId }))
                    .catch((e) => reply(msg._id, { ok: false, error: String(e) }));
                break;
            case 'inviteToGroup':
                await inviteToGroup(msg.groupId, msg.upeerId);
                reply(msg._id, { ok: true });
                break;
            case 'sendGroupMessage':
                await sendGroupMessage(msg.groupId, msg.message);
                reply(msg._id, { ok: true });
                break;
            case 'getMessageStatus':
                reply(msg._id, { ok: true, status: getMessageStatus(msg.id) });
                break;
            case 'getContact':
                reply(msg._id, { ok: true, contact: contacts.getContactByUpeerId(msg.upeerId) });
                break;
            case 'sendFile':
                await fileTransferManager
                    .startSend(msg.upeerId, msg.address, msg.filePath, undefined, msg.caption)
                    .then((fileId) => reply(msg._id, { ok: true, fileId }))
                    .catch((e) => reply(msg._id, { ok: false, error: String(e) }));
                break;
            case 'getTransfers':
                reply(msg._id, {
                    ok: true,
                    transfers: fileTransferManager.getAllTransfers().filter((t) => t.direction === msg.direction),
                });
                break;
            case 'queryOwnVaults':
                await VaultManager.queryOwnVaults('test');
                reply(msg._id, { ok: true });
                break;
            case 'shutdown':
                server.close();
                process.exit(0);
                break;
            default:
                reply(msg._id, { ok: false, error: `unknown ${msg.type}` });
        }
    };
    run().catch((e) => reply(msg._id, { ok: false, error: String(e) }));
});

process.send({ type: 'ready', peerId, upeerId: myId, pubKey, port, dir, spk: identity.getMySignedPreKey() });
