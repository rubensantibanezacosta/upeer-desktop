import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sodium from 'sodium-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');
import { resetDeviceIdentityCache } from '../../../src/main_process/security/deviceIdentity.js';
import { clearDeviceSpkCache, getDeviceSpkBySpkId, getMyDeviceSignedPreKey } from '../../../src/main_process/security/deviceSpk.js';
import {
    buildMyDeviceHandshakeFields,
    decryptSealedWithDevice,
    parseDeviceHandshakeFields,
    resolveInboundDeviceSpk,
    signWithDevice,
    toContactDeviceBinding,
    verifyDeviceSignature,
} from '../../../src/main_process/security/deviceMessaging.js';
import { identityState } from '../../../src/main_process/security/identityState.js';
import { getUPeerIdFromPublicKey } from '../../../src/main_process/security/identityCrypto.js';
import { sealPacket } from '../../../src/main_process/network/sealed.js';

let userDataPath = '';

function initializeIdentity(_now: number): { publicKey: string; secretKey: Buffer } {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    identityState.publicKey = publicKey;
    identityState.secretKey = secretKey;
    identityState.upeerId = getUPeerIdFromPublicKey(publicKey);
    identityState.userDataPath = userDataPath;
    identityState.dhtStatePath = path.join(userDataPath, 'dht_state.json');
    identityState.isLocked = false;
    identityState.dhtSeq = 0;
    identityState.spkPublicKey = null;
    identityState.spkSecretKey = null;
    identityState.spkId = 0;
    identityState.previousSpkEntries = [];
    return { publicKey: publicKey.toString('hex'), secretKey };
}

beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-device-messaging-'));
    vi.useFakeTimers({ now: new Date('2026-10-22T12:00:00.000Z') });
    resetDeviceIdentityCache();
    clearDeviceSpkCache();
});

afterEach(() => {
    vi.useRealTimers();
    resetDeviceIdentityCache();
    clearDeviceSpkCache();
    identityState.publicKey = null;
    identityState.secretKey = null;
    identityState.upeerId = '';
    identityState.userDataPath = '';
    identityState.dhtStatePath = '';
    identityState.isLocked = true;
    fs.rmSync(userDataPath, { recursive: true, force: true });
});

describe('device signed pre-key', () => {
    it('genera un SPK firmado por la clave de dispositivo y lo recupera por ID', () => {
        const now = Date.now();
        initializeIdentity(now);
        const bundle = getMyDeviceSignedPreKey(now);
        if (!bundle) throw new Error('device SPK was not generated');
        const fields = buildMyDeviceHandshakeFields(now);
        if (!fields) throw new Error('device handshake fields were not generated');

        expect(verifyDeviceSignature(Buffer.from(bundle.spkPub, 'hex'), bundle.spkSig, fields.devicePublicKey)).toBe(true);
        const retrieved = getDeviceSpkBySpkId(bundle.spkId, now);
        expect(retrieved?.spkPk.toString('hex')).toBe(bundle.spkPub);
        expect(retrieved?.spkSk.length).toBe(sodium.crypto_box_SECRETKEYBYTES);
        expect(resolveInboundDeviceSpk(bundle.spkId, now)?.spkSk.length)
            .toBe(sodium.crypto_box_SECRETKEYBYTES);
        expect(resolveInboundDeviceSpk(bundle.spkId + 1, now)).toBeNull();
    });

    it('rota el SPK después de siete días y conserva el anterior', () => {
        const now = Date.now();
        initializeIdentity(now);
        const first = getMyDeviceSignedPreKey(now);
        if (!first) throw new Error('device SPK was not generated');

        vi.setSystemTime(new Date(now + 8 * 24 * 60 * 60 * 1000));
        clearDeviceSpkCache();
        resetDeviceIdentityCache();
        const next = getMyDeviceSignedPreKey(Date.now());
        if (!next) throw new Error('rotated device SPK was not generated');

        expect(next.spkId).toBeGreaterThan(first.spkId);
        expect(next.spkPub).not.toBe(first.spkPub);
        expect(getDeviceSpkBySpkId(first.spkId, Date.now())?.spkPk.toString('hex')).toBe(first.spkPub);
    });
});

describe('device handshake binding', () => {
    it('valida certificado, deviceId y SPK, y produce el vínculo persistible', () => {
        const now = Date.now();
        initializeIdentity(now);
        const fields = buildMyDeviceHandshakeFields(now);
        if (!fields) throw new Error('device handshake fields were not generated');

        const parsed = parseDeviceHandshakeFields(fields, identityState.upeerId, now);
        expect(parsed).not.toBeNull();
        expect(parsed?.deviceId).toBe(fields.deviceId);
        expect(parsed?.devicePublicKey).toBe(fields.devicePublicKey);

        const binding = toContactDeviceBinding(fields);
        expect(JSON.parse(binding.deviceCertificate).deviceId).toBe(fields.deviceId);
        expect(binding.deviceSignedPreKeyId).toBe(fields.deviceSignedPreKey.spkId);
    });

    it('rechaza una firma SPK, una clave o un certificado manipulados', () => {
        const now = Date.now();
        initializeIdentity(now);
        const fields = buildMyDeviceHandshakeFields(now);
        if (!fields) throw new Error('device handshake fields were not generated');

        const badSignature = {
            ...fields,
            deviceSignedPreKey: { ...fields.deviceSignedPreKey, spkSig: '00'.repeat(64) },
        };
        expect(parseDeviceHandshakeFields(badSignature, identityState.upeerId, now)).toBeNull();

        const badKey = { ...fields, devicePublicKey: '11'.repeat(32) };
        expect(parseDeviceHandshakeFields(badKey, identityState.upeerId, now)).toBeNull();

        const badCertificate = {
            ...fields,
            deviceCertificate: { ...fields.deviceCertificate, signature: '00'.repeat(64) },
        };
        expect(parseDeviceHandshakeFields(badCertificate, identityState.upeerId, now)).toBeNull();
        expect(parseDeviceHandshakeFields(fields, '22'.repeat(32), now)).toBeNull();
    });

    it('firma con la clave de dispositivo y descifra un sealed dirigido a ella', () => {
        const now = Date.now();
        initializeIdentity(now);
        const fields = buildMyDeviceHandshakeFields(now);
        if (!fields) throw new Error('device handshake fields were not generated');
        const payload = Buffer.from(JSON.stringify({ type: 'CHAT', id: 'device-message' }));
        const signature = signWithDevice(payload, now);
        if (!signature) throw new Error('device signature was not produced');

        expect(verifyDeviceSignature(payload, signature.toString('hex'), fields.devicePublicKey)).toBe(true);
        const sealed = sealPacket({ type: 'CHAT', id: 'device-message' }, fields.devicePublicKey);
        const opened = decryptSealedWithDevice(Buffer.from(String(sealed.ciphertext), 'hex'), now);
        expect(opened?.toString('utf8')).toBe('{"type":"CHAT","id":"device-message"}');
    });
});
