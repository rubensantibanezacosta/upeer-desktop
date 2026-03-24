import sodium from 'sodium-native';

export interface GroupSenderState {
    epoch: number;
    senderKey: string;
    senderKeyCreatedAt: number;
}

export function generateGroupSenderState(epoch = 1): GroupSenderState {
    const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(key);
    return {
        epoch,
        senderKey: key.toString('hex'),
        senderKeyCreatedAt: Date.now()
    };
}

export function rotateGroupSenderState(currentEpoch: number): GroupSenderState {
    const nextEpoch = Number.isInteger(currentEpoch) && currentEpoch > 0 ? currentEpoch + 1 : 1;
    return generateGroupSenderState(nextEpoch);
}

export function encryptGroupMessage(plaintext: string, senderKeyHex: string): { nonce: string; ciphertext: string } {
    const key = Buffer.from(senderKeyHex, 'hex');
    if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
        throw new Error('Invalid group sender key');
    }

    const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
    sodium.randombytes_buf(nonce);

    const message = Buffer.from(plaintext, 'utf-8');
    const ciphertext = Buffer.alloc(message.length + sodium.crypto_secretbox_MACBYTES);
    sodium.crypto_secretbox_easy(ciphertext, message, nonce, key);

    return {
        nonce: nonce.toString('hex'),
        ciphertext: ciphertext.toString('hex')
    };
}

export function decryptGroupMessage(nonceHex: string, ciphertextHex: string, senderKeyHex: string): string | null {
    const key = Buffer.from(senderKeyHex, 'hex');
    const nonce = Buffer.from(nonceHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    if (
        key.length !== sodium.crypto_secretbox_KEYBYTES ||
        nonce.length !== sodium.crypto_secretbox_NONCEBYTES ||
        ciphertext.length < sodium.crypto_secretbox_MACBYTES
    ) {
        return null;
    }

    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_secretbox_MACBYTES);
    const ok = sodium.crypto_secretbox_open_easy(plaintext, ciphertext, nonce, key);
    return ok ? plaintext.toString('utf-8') : null;
}

export function isValidGroupSenderKey(senderKey: unknown): senderKey is string {
    return typeof senderKey === 'string' && /^[0-9a-f]{64}$/i.test(senderKey);
}

export function isValidGroupEpoch(epoch: unknown): epoch is number {
    return typeof epoch === 'number' && Number.isInteger(epoch) && epoch > 0 && epoch < 2_147_483_648;
}