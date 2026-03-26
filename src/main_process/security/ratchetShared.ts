import sodium from 'sodium-native';
import crypto from 'node:crypto';

export const MAX_SKIP = 1000;
export const MAX_SKIPPED_TOTAL = 2000;

export interface SignedPreKeyBundle {
    spkPub: string;
    spkSig: string;
    spkId: number;
}

export interface X3DHInitPacket {
    ekPub: string;
    spkId: number;
    ikPub: string;
}

export interface RatchetState {
    rk: Buffer;
    cks: Buffer | null;
    ckr: Buffer | null;
    ns: number;
    nr: number;
    pn: number;
    dhsPk: Buffer;
    dhsSk: Buffer;
    dhr: Buffer | null;
    skipped: Map<string, Buffer>;
}

export interface RatchetHeader {
    dh: string;
    pn: number;
    n: number;
}

export interface SerializedRatchetState {
    rk: string;
    cks: string | null;
    ckr: string | null;
    ns: number;
    nr: number;
    pn: number;
    dhsPk: string;
    dhsSk: string;
    dhr: string | null;
    skipped: Record<string, string>;
    spkIdUsed?: number | null;
}

export function hkdf(rootKey: Buffer, inputMaterial: Buffer, info: string): [Buffer, Buffer] {
    const prk = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    sodium.crypto_generichash(prk, inputMaterial, rootKey);

    const out1 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    const out2 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    const ctx = Buffer.alloc(8);
    Buffer.from(info.slice(0, 8).padEnd(8, '\0'), 'ascii').copy(ctx);

    sodium.crypto_kdf_derive_from_key(out1, 1, ctx, prk);
    sodium.crypto_kdf_derive_from_key(out2, 2, ctx, prk);

    return [out1, out2];
}

export function chainStep(ck: Buffer): [messageKey: Buffer, nextCk: Buffer] {
    const mk = crypto.createHmac('sha256', ck).update(Buffer.from([0x01])).digest();
    const nck = crypto.createHmac('sha256', ck).update(Buffer.from([0x02])).digest();
    return [mk, nck];
}