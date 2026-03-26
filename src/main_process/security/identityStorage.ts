import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import { error, debug } from './secure-logger.js';
import {
    ALIAS_FILE,
    AVATAR_FILE,
    DEVICE_KEY_FILE,
    identityState,
    MAX_PREVIOUS_SPK,
    MNEMONIC_ENC_FILE,
    SESSION_ENC_FILE,
    SESSION_LOCKED_FILE,
    SPK_STATE_FILE,
} from './identityState.js';

function getUPeerIdFromPublicKey(publicKey: Buffer): string {
    const hash = Buffer.alloc(sodium.crypto_generichash_BYTES);
    sodium.crypto_generichash(hash, publicKey);
    return hash.toString('hex');
}

export function getOrCreateDeviceKey(userDataPath: string): Buffer {
    const deviceKeyPath = path.join(userDataPath, DEVICE_KEY_FILE);
    if (fs.existsSync(deviceKeyPath)) {
        const deviceKey = fs.readFileSync(deviceKeyPath);
        if (deviceKey.length === sodium.crypto_secretbox_KEYBYTES) return deviceKey;
    }
    const deviceKey = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(deviceKey);
    fs.writeFileSync(deviceKeyPath, deviceKey, { mode: 0o600 });
    return deviceKey;
}

export function saveEncryptedSession(userDataPath: string): void {
    if (!identityState.secretKey) return;
    try {
        const deviceKey = getOrCreateDeviceKey(userDataPath);
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(identityState.secretKey.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, identityState.secretKey, nonce, deviceKey);
        fs.writeFileSync(path.join(userDataPath, SESSION_ENC_FILE), Buffer.concat([nonce, cipher]), { mode: 0o600 });

        if (identityState.mnemonic) {
            const mnemonicNonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
            sodium.randombytes_buf(mnemonicNonce);
            const mnemonicBuffer = Buffer.from(identityState.mnemonic, 'utf8');
            const mnemonicCipher = Buffer.alloc(mnemonicBuffer.length + sodium.crypto_secretbox_MACBYTES);
            sodium.crypto_secretbox_easy(mnemonicCipher, mnemonicBuffer, mnemonicNonce, deviceKey);
            fs.writeFileSync(path.join(userDataPath, MNEMONIC_ENC_FILE), Buffer.concat([mnemonicNonce, mnemonicCipher]), { mode: 0o600 });
        }

        const lockedPath = path.join(userDataPath, SESSION_LOCKED_FILE);
        if (fs.existsSync(lockedPath)) fs.unlinkSync(lockedPath);
    } catch (err) {
        error('No se pudo guardar la sesión cifrada', err, 'identity');
    }
}

export function tryLoadEncryptedSession(userDataPath: string): boolean {
    const encryptedPath = path.join(userDataPath, SESSION_ENC_FILE);
    const lockedPath = path.join(userDataPath, SESSION_LOCKED_FILE);
    if (!fs.existsSync(encryptedPath) || fs.existsSync(lockedPath)) return false;

    try {
        const deviceKey = getOrCreateDeviceKey(userDataPath);
        const blob = fs.readFileSync(encryptedPath);
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        const opened = sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey);
        if (!opened || plain.length !== sodium.crypto_sign_SECRETKEYBYTES) return false;

        identityState.secretKey = plain;
        identityState.publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_pk(identityState.publicKey, plain);
        identityState.upeerId = getUPeerIdFromPublicKey(identityState.publicKey);

        const mnemonicPath = path.join(userDataPath, MNEMONIC_ENC_FILE);
        if (fs.existsSync(mnemonicPath)) {
            try {
                const mnemonicBlob = fs.readFileSync(mnemonicPath);
                const mnemonicNonce = mnemonicBlob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
                const mnemonicCipher = mnemonicBlob.subarray(sodium.crypto_secretbox_NONCEBYTES);
                const mnemonicPlain = Buffer.alloc(mnemonicCipher.length - sodium.crypto_secretbox_MACBYTES);
                const openedMnemonic = sodium.crypto_secretbox_open_easy(mnemonicPlain, mnemonicCipher, mnemonicNonce, deviceKey);
                if (openedMnemonic) identityState.mnemonic = mnemonicPlain.toString('utf8');
            } catch (err) {
                error('No se pudo cargar el mnemonic cifrado', err, 'identity');
            }
        }

        identityState.isLocked = false;
        identityState.isMnemonicBased = true;
        return true;
    } catch (err) {
        error('No se pudo cargar la sesión cifrada', err, 'identity');
        return false;
    }
}

export function loadDhtSeq(): void {
    if (!fs.existsSync(identityState.dhtStatePath)) return;
    try {
        const data = JSON.parse(fs.readFileSync(identityState.dhtStatePath, 'utf8'));
        if (typeof data.seq === 'number') identityState.dhtSeq = data.seq;
    } catch (err) {
        error('Error al cargar dht_state.json', err, 'identity');
    }
}

export function saveDhtSeq(): void {
    try {
        fs.writeFileSync(identityState.dhtStatePath, JSON.stringify({ seq: identityState.dhtSeq }));
    } catch (err) {
        error('Error al guardar dht_state.json', err, 'identity');
    }
}

export function loadProfileFiles(): void {
    const aliasPath = path.join(identityState.userDataPath, ALIAS_FILE);
    if (fs.existsSync(aliasPath)) {
        identityState.myAlias = fs.readFileSync(aliasPath, 'utf8').trim();
    }
    const avatarPath = path.join(identityState.userDataPath, AVATAR_FILE);
    if (fs.existsSync(avatarPath)) {
        identityState.myAvatar = fs.readFileSync(avatarPath, 'utf8').trim();
    }
}

export function saveSpkState(): void {
    if (!identityState.userDataPath || !identityState.spkPublicKey || !identityState.spkSecretKey) return;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const payload = Buffer.from(JSON.stringify({
            spkPub: identityState.spkPublicKey.toString('hex'),
            spkSk: identityState.spkSecretKey.toString('hex'),
            spkId: identityState.spkId,
            prev: identityState.previousSpkEntries.map((entry) => ({
                id: entry.spkId,
                pk: entry.spkPk.toString('hex'),
                sk: entry.spkSk.toString('hex'),
            })),
        }), 'utf8');
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(path.join(identityState.userDataPath, SPK_STATE_FILE), Buffer.concat([nonce, cipher]), { mode: 0o600 });
    } catch (err) {
        error('Failed to save SPK state', err, 'identity');
    }
}

export function loadSpkState(): boolean {
    if (!identityState.userDataPath) return false;
    const spkStatePath = path.join(identityState.userDataPath, SPK_STATE_FILE);
    if (!fs.existsSync(spkStatePath)) {
        identityState.spkPublicKey = null;
        identityState.spkSecretKey = null;
        identityState.spkId = 0;
        identityState.previousSpkEntries.length = 0;
        return false;
    }
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const blob = fs.readFileSync(spkStatePath);
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) return false;

        const data = JSON.parse(plain.toString('utf8'));
        identityState.spkPublicKey = Buffer.from(data.spkPub, 'hex');
        identityState.spkSecretKey = Buffer.from(data.spkSk, 'hex');
        identityState.spkId = data.spkId;
        identityState.previousSpkEntries.length = 0;
        if (Array.isArray(data.prev)) {
            for (const entry of data.prev.slice(0, MAX_PREVIOUS_SPK)) {
                identityState.previousSpkEntries.push({
                    spkId: entry.id,
                    spkPk: Buffer.from(entry.pk, 'hex'),
                    spkSk: Buffer.from(entry.sk, 'hex'),
                });
            }
        }
        debug('SPK state restored from disk', { spkId: identityState.spkId }, 'identity');
        return true;
    } catch (err) {
        error('Failed to load SPK state', err, 'identity');
        return false;
    }
}
