import { warn } from '../../security/secure-logger.js';
import { decryptSealedWithDevice } from '../../security/deviceMessaging.js';
import { sealTransferKey, unsealTransferKey } from './crypto.js';

export type TransferKeyEnvelope = {
    encryptedKey?: string;
    encryptedKeyNonce?: string;
    deviceEncryptedKey?: string;
};

function isHexLength(value: unknown, length: number): value is string {
    return typeof value === 'string' && value.length === length && /^[0-9a-f]+$/i.test(value);
}

export function isDevicePublicKey(value: unknown): value is string {
    return isHexLength(value, 64);
}

export function sealTransferKeyEnvelope(
    aesKey: Buffer,
    accountPublicKey?: string | null,
    devicePublicKey?: string | null,
): TransferKeyEnvelope {
    const envelope: TransferKeyEnvelope = {};
    if (isDevicePublicKey(accountPublicKey)) {
        const sealed = sealTransferKey(aesKey, accountPublicKey);
        envelope.encryptedKey = sealed.ciphertext;
        if (sealed.nonce) envelope.encryptedKeyNonce = sealed.nonce;
    }
    if (isDevicePublicKey(devicePublicKey) && devicePublicKey.toLowerCase() !== accountPublicKey?.toLowerCase()) {
        envelope.deviceEncryptedKey = sealTransferKey(aesKey, devicePublicKey).ciphertext;
    }
    return envelope;
}

export function unsealTransferKeyEnvelope(
    envelope: { encryptedKey?: unknown; encryptedKeyNonce?: unknown; deviceEncryptedKey?: unknown },
    accountPublicKey?: string | null,
): Buffer | null {
    if (typeof envelope.encryptedKey === 'string' && envelope.encryptedKey) {
        try {
            const nonce = typeof envelope.encryptedKeyNonce === 'string' ? envelope.encryptedKeyNonce : undefined;
            const opened = unsealTransferKey(envelope.encryptedKey, nonce, accountPublicKey ?? undefined);
            if (opened) return opened;
            warn('No se pudo abrir la clave de archivo con la identidad de cuenta', undefined, 'file-transfer');
        } catch (err: unknown) {
            warn('Error al abrir la clave de archivo con la identidad de cuenta', err, 'file-transfer');
        }
    }
    if (typeof envelope.deviceEncryptedKey === 'string' && /^[0-9a-f]+$/i.test(envelope.deviceEncryptedKey)) {
        try {
            const opened = decryptSealedWithDevice(Buffer.from(envelope.deviceEncryptedKey, 'hex'));
            if (opened) return opened;
            warn('No se pudo abrir la clave de archivo con la identidad de dispositivo', undefined, 'file-transfer');
        } catch (err: unknown) {
            warn('Error al abrir la clave de archivo con la identidad de dispositivo', err, 'file-transfer');
        }
    }
    return null;
}
