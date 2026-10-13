import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebCodecsSession } from '../../../../src/features/call/webCodecsSession.js';

describe('WebCodecsSession', () => {
    afterEach(() => {
        const globals = globalThis as Record<string, unknown>;
        delete globals.EncodedVideoChunk;
        delete globals.VideoDecoder;
    });

    it('decodifica keyframes y deltas con su timestamp original', async () => {
        const decode = vi.fn();
        class FakeDecoder {
            static instances: Array<{ output: (frame: unknown) => void }> = [];
            state = 'configured';
            configure = vi.fn();
            flush = vi.fn(async () => undefined);
            close = vi.fn();
            decode = decode;

            constructor(init: { output: (frame: unknown) => void }) {
                FakeDecoder.instances.push(init);
            }
        }
        class FakeChunk {
            constructor(readonly init: unknown) {}
        }
        const globals = globalThis as Record<string, unknown>;
        globals.VideoDecoder = FakeDecoder;
        globals.EncodedVideoChunk = FakeChunk;
        const session = new WebCodecsSession();

        await session.decodeChunk('video', new Uint8Array([1]), 42_000, true, vi.fn());
        await session.decodeChunk('video', new Uint8Array([2]), 75_000, false, vi.fn());
        const peerOne = vi.fn();
        const peerTwo = vi.fn();
        await session.decodeChunk('video', new Uint8Array([3]), 90_000, false, peerOne, 'peer-1');
        await session.decodeChunk('video', new Uint8Array([4]), 91_000, false, peerTwo, 'peer-2');
        FakeDecoder.instances[1].output('decoded-1');
        FakeDecoder.instances[2].output('decoded-2');

        expect(decode).toHaveBeenNthCalledWith(1, expect.objectContaining({ init: { type: 'key', timestamp: 42_000, data: new Uint8Array([1]) } }));
        expect(decode).toHaveBeenNthCalledWith(2, expect.objectContaining({ init: { type: 'delta', timestamp: 75_000, data: new Uint8Array([2]) } }));
        expect(peerOne).toHaveBeenCalledWith('decoded-1');
        expect(peerTwo).toHaveBeenCalledWith('decoded-2');
        await session.release();
    });
});