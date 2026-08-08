import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    base64ToBytes,
    bytesToBase64,
    createMediaCodec,
    isWebCodecsAvailable,
    PassthroughMediaCodec,
    WebCodecsMediaCodec,
} from '../../../../src/features/call/createMediaCodec.js';

function restoreGlobals(): void {
    const globalObject = globalThis as Record<string, unknown>;
    delete globalObject.AudioEncoder;
    delete globalObject.VideoEncoder;
}

afterEach(() => {
    restoreGlobals();
});

describe('createMediaCodec', () => {
    it('sin WebCodecs devuelve el codec passthrough', () => {
        expect(isWebCodecsAvailable()).toBe(false);
        const codec = createMediaCodec();
        expect(codec).toBeInstanceOf(PassthroughMediaCodec);
    });

    it('con WebCodecs disponibles devuelve el codec WebCodecs', () => {
        const fake = vi.fn(function (this: unknown) {
            return this;
        }) as never;
        const globalObject = globalThis as Record<string, unknown>;
        globalObject.AudioEncoder = fake;
        globalObject.VideoEncoder = fake;
        expect(isWebCodecsAvailable()).toBe(true);
        expect(createMediaCodec()).toBeInstanceOf(WebCodecsMediaCodec);
    });
});

describe('PassthroughMediaCodec', () => {
    it('hace roundtrip de encode/decode sin alterar los bytes', async () => {
        const codec = new PassthroughMediaCodec();
        const data = new Uint8Array([1, 2, 3, 4]);
        const encoded = await codec.encode({ kind: 'audio', ts: 0, seq: 0, data });
        expect(encoded).toBe(bytesToBase64(data));
        const decoded = await codec.decode('audio', base64ToBytes(encoded));
        expect(Array.from(decoded)).toEqual([1, 2, 3, 4]);
        await codec.release();
    });
});
