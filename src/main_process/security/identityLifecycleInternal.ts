import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import * as bip39 from 'bip39';
import { debug, error, info } from './secure-logger.js';
import {
    MAX_PREVIOUS_EPH_KEYS,
    MAX_PREVIOUS_SPK,
    MNEMONIC_MODE_FLAG,
    SESSION_LOCKED_FILE,
    SPK_ROTATION_INTERVAL_MS,
    identityState,
} from './identityState.js';
import {
    loadDhtSeq,
    loadProfileFiles,
    loadSpkState,
    saveDhtSeq,
    saveEncryptedSession,
    saveSpkState,
    tryLoadEncryptedSession,
} from './identityStorage.js';
import { getUPeerIdFromPublicKey } from './identityCrypto.js';
import {
    applyDeviceOnlyIdentity,
    clearAccountPublicIdentity,
    loadAccountPublicIdentity,
    resetIdentityMode,
} from './identityMode.js';
import { resetDeviceIdentityCache } from './deviceIdentity.js';

export function incrementDhtSeq(): number {
    identityState.dhtSeq++;
    saveDhtSeq();
    return identityState.dhtSeq;
}

export function rotateSpk(): void {
    if (identityState.spkPublicKey && (Date.now() - identityState.spkId) < SPK_ROTATION_INTERVAL_MS) {
        return;
    }
    if (identityState.spkPublicKey && identityState.spkSecretKey) {
        identityState.previousSpkEntries.unshift({
            spkId: identityState.spkId,
            spkPk: identityState.spkPublicKey,
            spkSk: identityState.spkSecretKey,
        });
        if (identityState.previousSpkEntries.length > MAX_PREVIOUS_SPK) identityState.previousSpkEntries.pop();
    }
    const publicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(publicKey, secretKey);
    identityState.spkPublicKey = publicKey;
    identityState.spkSecretKey = secretKey;
    identityState.spkId = Date.now();
    debug('Signed PreKey rotada', { spkId: identityState.spkId }, 'identity');
    saveSpkState();
}

export function rotateEphemeralKey(): void {
    if (identityState.ephemeralPublicKey && identityState.ephemeralSecretKey) {
        identityState.previousEphemeralSecretKeys.unshift(identityState.ephemeralSecretKey);
        if (identityState.previousEphemeralSecretKeys.length > MAX_PREVIOUS_EPH_KEYS) {
            identityState.previousEphemeralSecretKeys.pop();
        }
    }
    const publicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(publicKey, secretKey);
    identityState.ephemeralPublicKey = publicKey;
    identityState.ephemeralSecretKey = secretKey;
    identityState.ephemeralKeyRotationCounter = 0;
    debug('Clave efímera rotada', {}, 'identity');
}

function resetRotationIntervals(): void {
    if (identityState.spkRotationInterval) clearInterval(identityState.spkRotationInterval);
    if (identityState.ephemeralKeyRotationInterval) clearInterval(identityState.ephemeralKeyRotationInterval);
    identityState.spkRotationInterval = setInterval(() => rotateSpk(), SPK_ROTATION_INTERVAL_MS);
    identityState.ephemeralKeyRotationInterval = null;
}

export function initIdentity(userDataPath: string): void {
    identityState.userDataPath = userDataPath;
    const mnemonicModeFlagPath = path.join(userDataPath, MNEMONIC_MODE_FLAG);
    const legacyKeyPath = path.join(userDataPath, 'identity.key');

    if (!fs.existsSync(mnemonicModeFlagPath) && fs.existsSync(legacyKeyPath)) {
        try {
            fs.renameSync(legacyKeyPath, `${legacyKeyPath}.legacy-bak`);
        } catch (err) {
            error('Error al renombrar clave heredada', err, 'identity');
        }
        info('Instalación heredada detectada. Clave aleatoria respaldada. Se requiere frase semilla.', {}, 'identity');
    }

    identityState.dhtStatePath = path.join(userDataPath, 'dht_state.json');
    identityState.isMnemonicBased = fs.existsSync(mnemonicModeFlagPath);
    loadDhtSeq();
    loadProfileFiles();

    const accountPublic = identityState.isMnemonicBased ? null : loadAccountPublicIdentity(userDataPath);
    if (accountPublic) {
        applyDeviceOnlyIdentity(userDataPath, accountPublic);
        if (fs.existsSync(path.join(userDataPath, SESSION_LOCKED_FILE))) {
            identityState.isLocked = true;
            info('Dispositivo sin raíz bloqueado por el usuario; requiere reenrolamiento.', {}, 'identity');
            return;
        }
        rotateEphemeralKey();
        info('Sesión restaurada en modo dispositivo, sin raíz de la cuenta.', { upeerId: accountPublic.accountUpeerId }, 'identity');
        return;
    }

    if (!identityState.isMnemonicBased) {
        identityState.isLocked = true;
        info('Primera ejecución. Se requiere crear o importar una frase semilla.', {}, 'identity');
        return;
    }

    const userExplicitlyLocked = fs.existsSync(path.join(userDataPath, SESSION_LOCKED_FILE));
    if (userExplicitlyLocked) {
        identityState.isLocked = true;
        info('Sesión bloqueada por el usuario.', {}, 'identity');
        return;
    }

    if (tryLoadEncryptedSession(userDataPath)) {
        identityState.upeerId = identityState.publicKey ? getUPeerIdFromPublicKey(identityState.publicKey) : '';
        identityState.isLocked = false;
        info('Sesión restaurada desde disco.', { upeerId: identityState.upeerId }, 'identity');
        rotateEphemeralKey();
        loadSpkState();
        rotateSpk();
        resetRotationIntervals();
    } else {
        identityState.isLocked = true;
        info('No hay sesión activa o clave de dispositivo inválida.', {}, 'identity');
    }
}

export function unlockSession(mnemonic: string): boolean {
    info('unlockSession called', { mnemonicValid: bip39.validateMnemonic(mnemonic) }, 'identity');
    if (!bip39.validateMnemonic(mnemonic)) return false;

    identityState.mnemonic = mnemonic;
    info('Mnemonic assigned in memory', { length: mnemonic.length }, 'identity');
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const entropy = seed.subarray(0, 32);
    identityState.publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    identityState.secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_seed_keypair(identityState.publicKey, identityState.secretKey, entropy);
    identityState.upeerId = getUPeerIdFromPublicKey(identityState.publicKey);
    identityState.isLocked = false;
    identityState.isMnemonicBased = true;
    resetIdentityMode();
    clearAccountPublicIdentity(identityState.userDataPath);
    fs.writeFileSync(path.join(identityState.userDataPath, MNEMONIC_MODE_FLAG), '1');
    saveEncryptedSession(identityState.userDataPath);
    rotateEphemeralKey();
    loadSpkState();
    rotateSpk();
    resetRotationIntervals();
    info('Sesión desbloqueada con frase semilla.', { upeerId: identityState.upeerId }, 'identity');
    return true;
}

export function lockSession(): void {
    const encryptedPath = path.join(identityState.userDataPath, 'identity.enc');
    if (fs.existsSync(encryptedPath)) {
        try {
            fs.unlinkSync(encryptedPath);
        } catch (err) {
            error('Error al eliminar sesión cifrada al bloquear', err, 'identity');
        }
    }
    const spkStatePath = path.join(identityState.userDataPath, 'spk.enc');
    if (fs.existsSync(spkStatePath)) {
        try {
            fs.unlinkSync(spkStatePath);
        } catch (err) {
            error('Error al eliminar estado SPK al bloquear', err, 'identity');
        }
    }
    fs.writeFileSync(path.join(identityState.userDataPath, SESSION_LOCKED_FILE), '1');
    resetDeviceIdentityCache();
    if (identityState.secretKey) sodium.sodium_memzero(identityState.secretKey);
    identityState.mnemonic = null;
    if (identityState.ephemeralSecretKey) sodium.sodium_memzero(identityState.ephemeralSecretKey);
    if (identityState.spkSecretKey) sodium.sodium_memzero(identityState.spkSecretKey);
    identityState.previousSpkEntries.forEach((entry) => sodium.sodium_memzero(entry.spkSk));
    identityState.previousEphemeralSecretKeys.forEach((secretKey) => sodium.sodium_memzero(secretKey));
    identityState.isLocked = true;
    if (identityState.spkRotationInterval) clearInterval(identityState.spkRotationInterval);
    if (identityState.ephemeralKeyRotationInterval) clearInterval(identityState.ephemeralKeyRotationInterval);
    info('Sesión bloqueada explícitamente.', {}, 'identity');
}

export function clearIdentityState(): void {
    resetDeviceIdentityCache();
    if (identityState.secretKey) sodium.sodium_memzero(identityState.secretKey);
    if (identityState.ephemeralSecretKey) sodium.sodium_memzero(identityState.ephemeralSecretKey);
    if (identityState.spkSecretKey) sodium.sodium_memzero(identityState.spkSecretKey);
    identityState.previousSpkEntries.forEach((entry) => sodium.sodium_memzero(entry.spkSk));
    identityState.previousEphemeralSecretKeys.forEach((secretKey) => sodium.sodium_memzero(secretKey));
    if (identityState.spkRotationInterval) clearInterval(identityState.spkRotationInterval);
    if (identityState.ephemeralKeyRotationInterval) clearInterval(identityState.ephemeralKeyRotationInterval);
    identityState.publicKey = null;
    identityState.secretKey = null;
    identityState.upeerId = '';
    identityState.ephemeralPublicKey = null;
    identityState.ephemeralSecretKey = null;
    identityState.spkPublicKey = null;
    identityState.spkSecretKey = null;
    identityState.spkId = 0;
    identityState.spkRotationInterval = null;
    identityState.previousSpkEntries = [];
    identityState.previousEphemeralSecretKeys = [];
    identityState.ephemeralKeyRotationInterval = null;
    identityState.ephemeralKeyRotationCounter = 0;
    identityState.dhtSeq = 0;
    identityState.myAlias = '';
    identityState.myAvatar = '';
    identityState.isLocked = true;
    identityState.isMnemonicBased = false;
    identityState.mnemonic = null;
    resetIdentityMode();
}

export function validateMnemonicIdentity(mnemonic: string): boolean {
    if (!bip39.validateMnemonic(mnemonic)) return false;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed.subarray(0, 32));
    const expectedId = getUPeerIdFromPublicKey(publicKey);
    sodium.sodium_memzero(secretKey);
    return identityState.isMnemonicBased && identityState.upeerId === expectedId;
}

export function resetIdentityForEmptyDevice(userDataPath: string): void {
    clearIdentityState();
    clearAccountPublicIdentity(userDataPath);
    identityState.userDataPath = userDataPath;
    identityState.dhtStatePath = path.join(userDataPath, 'dht_state.json');
    identityState.isLocked = true;
}
