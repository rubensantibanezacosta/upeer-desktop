import { describe, expect, it } from 'vitest';
import {
    base64ToBytes,
    bytesToBase64,
    decodeMediaFrame,
    encodeMediaFrame,
    MediaJitterBuffer,
    type MediaFrame,
} from '../../../../src/features/call/mediaChunker.js';

function frame(seq: number, data?: number[]): MediaFrame {
    return { kind: 'audio', ts: seq * 10, seq, data: new Uint8Array(data ?? [seq]) };
}

describe('mediaChunker', () => {
    it('hace roundtrip de un frame', () => {
        const encoded = encodeMediaFrame({ kind: 'video', ts: 100, seq: 5, data: new Uint8Array([1, 2, 3, 4]) });
        const decoded = decodeMediaFrame(encoded);
        expect(decoded).not.toBeNull();
        const frameResult = decoded as MediaFrame;
        expect(frameResult.kind).toBe('video');
        expect(frameResult.ts).toBe(100);
        expect(frameResult.seq).toBe(5);
        expect(Array.from(frameResult.data)).toEqual([1, 2, 3, 4]);
    });

    it('devuelve null ante base64 inválida o payload corto', () => {
        expect(decodeMediaFrame('!!!')).toBeNull();
        expect(decodeMediaFrame(bytesToBase64(new Uint8Array([0, 0])))).toBeNull();
    });

    it('base64ToBytes/bytesToBase64 roundtrip', () => {
        const bytes = base64ToBytes(bytesToBase64(new Uint8Array([9, 8, 7])));
        expect(Array.from(bytes)).toEqual([9, 8, 7]);
    });
});

describe('MediaJitterBuffer', () => {
    it('espera el siguiente seq y entrega en orden', () => {
        const jb = new MediaJitterBuffer();
        expect(jb.push(frame(1))).toBeNull();
        const out0 = jb.push(frame(0));
        expect(out0).not.toBeNull();
        expect((out0 as MediaFrame).seq).toBe(0);
        const out1 = jb.push(frame(1));
        expect((out1 as MediaFrame).seq).toBe(1);
    });

    it('descarta duplicados y frames tardíos', () => {
        const jb = new MediaJitterBuffer();
        jb.push(frame(0));
        jb.push(frame(0));
        expect(jb.push(frame(1))).not.toBeNull();
        expect(jb.push(frame(0))).toBeNull();
    });

    it('acota la memoria descartando el más antiguo al desbordar', () => {
        const jb = new MediaJitterBuffer(3);
        for (let i = 0; i < 100; i++) {
            jb.push(frame(i));
        }
        expect(jb['entries'].size).toBeLessThanOrEqual(3);
    });
});
