import { describe, expect, it } from 'vitest';
import { encodeMediaFrame } from '../../../../src/features/call/mediaChunker.js';
import {
    MediaPipeline,
    type MediaCodec,
    type MediaTransport,
} from '../../../../src/features/call/mediaPipeline.js';

function makeCodec(overrides: Partial<MediaCodec> = {}): MediaCodec {
    return {
        encode: async () => bytes([9]),
        decode: async (_kind, data) => data,
        release: async () => undefined,
        ...overrides,
    };
}

function bytes(values: number[]): string {
    let binary = '';
    for (const value of values) {
        binary += String.fromCharCode(value);
    }
    return btoa(binary);
}

function makeTransport(onSend: (data: string) => void): MediaTransport {
    return { sendMedia: onSend };
}

describe('MediaPipeline', () => {
    it('envía frames codificados por el transporte cuando está habilitado', async () => {
        const sent: string[] = [];
        const pipeline = new MediaPipeline(makeCodec(), makeTransport((d) => sent.push(d)));
        pipeline.setEnabled(true);
        await pipeline.pushLocalFrame('audio', 10, new Uint8Array([1, 2]));
        expect(sent.length).toBe(1);
    });

    it('no envía nada cuando está deshabilitado', async () => {
        const sent: string[] = [];
        const pipeline = new MediaPipeline(makeCodec(), makeTransport((d) => sent.push(d)));
        await pipeline.pushLocalFrame('audio', 1, new Uint8Array([1]));
        expect(sent.length).toBe(0);
    });

    it('recibe un chunk y entrega el payload en orden', () => {
        const pipeline = new MediaPipeline(makeCodec(), makeTransport(() => undefined));
        const encoded = encodeMediaFrame({ kind: 'audio', ts: 0, seq: 0, data: new Uint8Array([3, 4]) });
        const out = pipeline.receive(encoded);
        expect(out).not.toBeNull();
        expect(Array.from(out as Uint8Array)).toEqual([3, 4]);
    });

    it('delega la decodificación en el codec', async () => {
        const pipeline = new MediaPipeline(makeCodec(), makeTransport(() => undefined));
        const decoded = await pipeline.decodePayload('video', new Uint8Array([5]));
        expect(Array.from(decoded)).toEqual([5]);
    });

    it('resetea la secuencia y el jitter buffer', async () => {
        const sent: string[] = [];
        const pipeline = new MediaPipeline(makeCodec(), makeTransport((d) => sent.push(d)));
        pipeline.setEnabled(true);
        await pipeline.pushLocalFrame('audio', 1, new Uint8Array([1]));
        pipeline.reset();
        await pipeline.pushLocalFrame('audio', 2, new Uint8Array([2]));
        expect(sent.length).toBe(2);
    });
});
