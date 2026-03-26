import * as bip39 from 'bip39';
import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import {
    decrypt,
    decryptSealed,
    decryptWithIdentityKey,
    decryptX3DH,
    encrypt,
    getUPeerIdFromPublicKey,
    sign,
    verify,
} from './identityCrypto.js';
import {
    incrementDhtSeq as incrementDhtSeqInternal,
    initIdentity,
    lockSession,
    rotateEphemeralKey,
    rotateSpk,
    unlockSession,
} from './identityLifecycleInternal.js';
import { EPHEMERAL_KEY_MAX_MESSAGES, identityState } from './identityState.js';
import { getOrCreateDeviceKey } from './identityStorage.js';

export {
    decrypt,
    decryptSealed,
    decryptWithIdentityKey,
    decryptX3DH,
    encrypt,
    getUPeerIdFromPublicKey,
    initIdentity,
    lockSession,
    sign,
    unlockSession,
    verify,
};

export function getDhtSeq(): number {
    return identityState.dhtSeq;
}

export function incrementDhtSeq(): number {
    return incrementDhtSeqInternal();
}

export function isLocked(): boolean {
    return identityState.isLocked;
}

export function isMnemonicBased(): boolean {
    return identityState.isMnemonicBased;
}

export function getMyUPeerId(): string {
    return identityState.upeerId || '';
}

export function getMyDeviceId(): string {
    if (!identityState.userDataPath) return 'unknown';
    const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
    const hash = Buffer.alloc(32);
    sodium.crypto_generichash(hash, deviceKey);
    return hash.toString('hex');
}

export function getMyPublicKey(): Buffer {
    return identityState.publicKey as Buffer;
}

export function getMyIdentitySkBuffer(): Buffer {
    if (identityState.isLocked || !identityState.secretKey) throw new Error('Identity is locked');
    return identityState.secretKey;
}

export function getMyEphemeralPublicKey(): Buffer {
    return identityState.ephemeralPublicKey as Buffer;
}

export function getSpkBySpkId(id: number): { spkPk: Buffer; spkSk: Buffer } | null {
    if (identityState.spkId === id && identityState.spkPublicKey && identityState.spkSecretKey) {
        return { spkPk: identityState.spkPublicKey, spkSk: identityState.spkSecretKey };
    }
    const entry = identityState.previousSpkEntries.find((candidate) => candidate.spkId === id);
    return entry ? { spkPk: entry.spkPk, spkSk: entry.spkSk } : null;
}

export function getMySignedPreKey(): { spkPub: string; spkSig: string; spkId: number } {
    if (!identityState.spkPublicKey || !identityState.secretKey) {
        rotateSpk();
    }
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, identityState.spkPublicKey as Buffer, identityState.secretKey as Buffer);
    return {
        spkPub: (identityState.spkPublicKey as Buffer).toString('hex'),
        spkSig: signature.toString('hex'),
        spkId: identityState.spkId,
    };
}

export function setAlias(alias: string): void {
    identityState.myAlias = alias.trim();
    fs.writeFileSync(path.join(identityState.userDataPath, 'identity.alias'), identityState.myAlias);
}

export function getAlias(): string {
    return identityState.myAlias;
}

export function setAvatar(avatarBase64: string): void {
    identityState.myAvatar = avatarBase64;
    fs.writeFileSync(path.join(identityState.userDataPath, 'identity.avatar'), identityState.myAvatar);
}

export function getAvatar(): string {
    return identityState.myAvatar;
}

export function getMyPublicKeyHex(): string {
    return identityState.publicKey ? identityState.publicKey.toString('hex') : '';
}

export function getMyEphemeralPublicKeyHex(): string {
    return identityState.ephemeralPublicKey ? identityState.ephemeralPublicKey.toString('hex') : '';
}

export function getMyDhtSeq(): number {
    return identityState.dhtSeq;
}

export function incrementMyDhtSeq(): number {
    return incrementDhtSeqInternal();
}

export function generateMnemonic(): string {
    return bip39.generateMnemonic();
}

export function unlockWithMnemonic(mnemonic: string): boolean {
    return unlockSession(mnemonic);
}

export function createMnemonicIdentity(): string {
    const mnemonic = bip39.generateMnemonic();
    unlockSession(mnemonic);
    return mnemonic;
}

export function isSessionLocked(): boolean {
    return isLocked();
}

export function isMnemonicMode(): boolean {
    return isMnemonicBased();
}

export function getMnemonic(): string | null {
    return identityState.mnemonic;
}

export function getMyAlias(): string {
    return getAlias();
}

export function setMyAlias(alias: string): void {
    setAlias(alias);
}

export function getMyAvatar(): string {
    return getAvatar();
}

export function setMyAvatar(avatar: string): void {
    setAvatar(avatar);
}

export function incrementEphemeralMessageCounter(): void {
    identityState.ephemeralKeyRotationCounter++;
    if (identityState.ephemeralKeyRotationCounter >= EPHEMERAL_KEY_MAX_MESSAGES) rotateEphemeralKey();
}

export function getMySignedPreKeyBundle(): { spkPub: string; spkSig: string; spkId: number } {
    return getMySignedPreKey();
}
