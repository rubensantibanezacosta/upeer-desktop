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
        class FakeEncoder {
            static instances: Array<{ encodeQueueSize: number; encode: (frame: unknown) => void }> = [];
            state = 'configured';
            encodeQueueSize = 0;
            encode = vi.fn();
            configure = vi.fn();
            flush = vi.fn(async () => undefined);
            close = vi.fn();
            onoutput = null;

            constructor() {
                FakeEncoder.instances.push(this);
            }
        }
        class FakeChunk {
            constructor(readonly init: unknown) {}
        }
        const globals = globalThis as Record<string, unknown>;
        globals.VideoDecoder = FakeDecoder;
        globals.EncodedVideoChunk = FakeChunk;
        globals.VideoEncoder = FakeEncoder;
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

    it('descarta frames de vídeo cuando la cola del encoder está congestionada', async () => {
        const globals = globalThis as Record<string, unknown>;
        const encode = vi.fn();
        let encoderConfigured = false;
        let encoderOnOutput: ((chunk: { byteLength: number; timestamp: number; type: string; copyTo: (dest: Uint8Array) => void }) => void) | undefined;
        class FakeEncoder {
            static instance: FakeEncoder;
            get state() { return encoderConfigured ? 'configured' : 'unconfigured'; }
            encodeQueueSize = 0;
            configure = vi.fn(() => {
                encoderConfigured = true;
            });
            flush = vi.fn(async () => undefined);
            close = vi.fn();
            onoutput: (chunk: { byteLength: number; timestamp: number; type: string; copyTo: (dest: Uint8Array) => void }) => void;
            constructor(init: { output: (chunk: { byteLength: number; timestamp: number; type: string; copyTo: (dest: Uint8Array) => void }) => void }) {
                this.onoutput = init.output;
                encoderOnOutput = init.output;
                FakeEncoder.instance = this;
            }
            encode(frame: unknown, options?: { keyFrame?: boolean }) {
                encode(frame, options);
            }
        }
        class FakeDecoder {
            state = 'configured';
            configure = vi.fn();
            flush = vi.fn(async () => undefined);
            close = vi.fn();
            constructor() {
                this.state = 'configured';
            }
        }
        globals.VideoEncoder = FakeEncoder;
        globals.VideoDecoder = FakeDecoder;
        const session = new WebCodecsSession();
        const track = {} as MediaStreamTrack;
        const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
        const pendingReads: Array<(value: { done: boolean; value: { close: () => void } }) => void> = [];
        const frame = { close: vi.fn() };
        const reader = {
            read: () => new Promise<{ done: boolean; value: { close: () => void } }>((resolve) => { pendingReads.push(resolve); }),
            cancel: vi.fn(async () => undefined),
        };
        let processorCreated = false;
        globals.MediaStreamTrackProcessor = class {
            readable = { getReader: () => reader };
            constructor() {
                processorCreated = true;
            }
        };

        await session.startCapture(stream, 'video', vi.fn());
        expect(processorCreated).toBe(true);
        await vi.waitFor(() => expect(pendingReads.length).toBeGreaterThan(0));
        FakeEncoder.instance.encodeQueueSize = 2;
        pendingReads.shift()?.({ done: false, value: frame });
        await vi.waitFor(() => expect(frame.close).toHaveBeenCalledOnce());
        expect(encode).not.toHaveBeenCalled();
        FakeEncoder.instance.encodeQueueSize = 0;
        await vi.waitFor(() => expect(pendingReads.length).toBeGreaterThan(0));
        encoderOnOutput?.({
            byteLength: 1,
            timestamp: 0,
            type: 'key',
            copyTo: (destination) => { destination[0] = 1; },
        });
        expect(encode).not.toHaveBeenCalled();
        await session.release();
        delete globals.MediaStreamTrackProcessor;
        delete globals.VideoEncoder;
        delete globals.VideoDecoder;
    });
});