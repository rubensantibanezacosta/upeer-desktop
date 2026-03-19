import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Global state
global.testSentMessages = [];

// Mock for ESM
try {
    // Mock server.js
    const serverPath = path.join(projectRoot, 'src/main_process/network/server.js');
    mock.module(serverPath, {
        namedExports: {
            sendSecureUDPMessage: (ip, data) => {
                if (!global.testSentMessages) global.testSentMessages = [];
                global.testSentMessages.push({ ip, data });
            }
        }
    });

    // Mock identity.js with all common exports
    const identityPath = path.join(projectRoot, 'src/main_process/security/identity.js');
    mock.module(identityPath, {
        namedExports: {
            initIdentity: () => { },
            getMyUPeerId: () => 'my-id-mock',
            getMyPublicKey: () => Buffer.alloc(32, 1),
            getMyPublicKeyHex: () => '01'.repeat(32),
            sign: (_data) => Buffer.alloc(64, 0),
            verify: () => true,
            decrypt: (msg) => msg,
            encrypt: (msg) => ({ ciphertext: msg, nonce: Buffer.alloc(24, 0) }),
            getUPeerIdFromPublicKey: (pk) => pk.toString('hex'),
            rotateEphemeralKeys: () => { },
            stopEphemeralKeyRotation: () => { },
            incrementEphemeralMessageCounter: () => { },
            getMyDhtSeq: () => 0,
            incrementMyDhtSeq: () => 1
        }
    });

} catch (e) {
    console.error('ESM mocks failed:', e);
}
