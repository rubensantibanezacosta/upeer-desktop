import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { getOrCreateDeviceKey } from './identityStorage.js';
import { identityState } from './identityState.js';
import { isHex, parseCertificate, type AccountDeviceCertificate } from './deviceCertificate.js';
import { warn } from './secure-logger.js';

const STATE_FILE = 'device-identity.enc';

export interface StoredDeviceIdentity {
    secretKey: Buffer;
    publicKey: Buffer;
    certificate: AccountDeviceCertificate;
}

export function readStoredDeviceIdentity(account: string): StoredDeviceIdentity | null {
    const file = stateFile();
    if (!file || !fs.existsSync(file)) return null;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const blob = fs.readFileSync(file);
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) return null;
        const stored = JSON.parse(plain.toString('utf8')) as { secretKey?: unknown; certificate?: unknown };
        if (typeof stored.secretKey !== 'string' || !isHex(stored.secretKey, 64)) return null;
        const certificate = parseCertificate(stored.certificate);
        if (!certificate || certificate.accountUpeerId !== account.toLowerCase()) return null;
        const secretKey = Buffer.from(stored.secretKey, 'hex');
        const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_pk(publicKey, secretKey);
        return { secretKey, publicKey, certificate };
    } catch (err) {
        warn('Device identity could not be loaded', { error: errorMessage(err) }, 'identity');
        return null;
    }
}

export function saveStoredDeviceIdentity(secretKey: Buffer, certificate: AccountDeviceCertificate): void {
    const file = stateFile();
    if (!file) return;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const payload = Buffer.from(JSON.stringify({
            secretKey: secretKey.toString('hex'),
            certificate,
        }), 'utf8');
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(file, Buffer.concat([nonce, cipher]), { mode: 0o600 });
    } catch (err) {
        warn('Device identity could not be persisted', { error: errorMessage(err) }, 'identity');
    }
}

function stateFile(): string | null {
    return identityState.userDataPath ? path.join(identityState.userDataPath, STATE_FILE) : null;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
