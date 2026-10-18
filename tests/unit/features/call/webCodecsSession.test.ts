import { describe, expect, it, vi } from 'vitest';
import { WebCodecsSession } from '../../../../src/features/call/webCodecsSession.js';

class MockWorker extends EventTarget {
    messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];
    terminated = false;

    postMessage(message: unknown, transfer?: Transferable[]): void {
        this.messages.push({ message, transfer });
    }

    terminate(): void {
        this.terminated = true;
    }

    emit(data: unknown): void {
        this.dispatchEvent(Object.assign(new Event('message'), { data }));
    }
}

describe('WebCodecsSession worker bridge', () => {
    it('transfiere copia de payload al worker para decodificación y entrega frames por stream', async () => {
        const worker = new MockWorker();
        const session = new WebCodecsSession(() => worker as unknown as Worker);
        const decoded = vi.fn();
        worker.emit({ type: 'ready' });

        await session.decodeChunk('video', new Uint8Array([4, 5]), 42_000, true, decoded, 'peer-1');

        const message = worker.messages[0];
        expect(message?.message).toMatchObject({ type: 'decode', kind: 'video', timestamp: 42_000, keyFrame: true, streamId: 'peer-1' });
        expect(message?.transfer).toHaveLength(1);
        expect(new Uint8Array((message?.message as { bytes: ArrayBuffer }).bytes)).toEqual(new Uint8Array([4, 5]));

        const frame = { close: vi.fn() } as unknown as VideoFrame;
        worker.emit({ type: 'decoded', kind: 'video', streamId: 'peer-1', frame });
        expect(decoded).toHaveBeenCalledWith(frame);
        await session.release();
        expect(worker.terminated).toBe(true);
    });

    it('procesa track en el renderer y transfiere frames codificables al worker', async () => {
        const worker = new MockWorker();
        const frame = { close: vi.fn() } as unknown as VideoFrame;
        const trackClone = { stop: vi.fn() } as unknown as MediaStreamTrack;
        const track = { clone: vi.fn(() => trackClone) } as unknown as MediaStreamTrack;
        const reader = {
            read: vi.fn()
                .mockResolvedValueOnce({ value: frame, done: false })
                .mockResolvedValueOnce({ value: undefined, done: true }),
            cancel: vi.fn().mockResolvedValue(undefined),
        };
        vi.stubGlobal('MediaStreamTrackProcessor', class {
            readable = { getReader: () => reader };
            constructor(options: { track: MediaStreamTrack }) {
                expect(options.track).toBe(trackClone);
            }
        });
        const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
        const session = new WebCodecsSession(() => worker as unknown as Worker);
        worker.emit({ type: 'ready' });

        await session.startCapture(stream, 'video', vi.fn());
        await vi.waitFor(() => expect(worker.messages).toHaveLength(1));

        expect(track.clone).toHaveBeenCalledOnce();
        expect(worker.messages[0]?.message).toMatchObject({ type: 'encode-frame', kind: 'video', frame, captureId: 'video' });
        expect(worker.messages[0]?.transfer).toEqual([frame]);
        await session.release();
        vi.unstubAllGlobals();
    });

    it('permite capturar y detener un segundo track de audio para el sonido compartido', async () => {
        const worker = new MockWorker();
        const makeReader = () => ({ read: vi.fn().mockReturnValue(new Promise(() => undefined)), cancel: vi.fn().mockResolvedValue(undefined) });
        const readers = [makeReader(), makeReader()];
        let readerIndex = 0;
        vi.stubGlobal('MediaStreamTrackProcessor', class {
            readable = { getReader: () => readers[readerIndex++] };
            track: MediaStreamTrack;

            constructor(options: { track: MediaStreamTrack }) {
                this.track = options.track;
            }
        });
        const makeTrack = () => ({ clone: vi.fn(() => ({ stop: vi.fn() })) } as unknown as MediaStreamTrack);
        const session = new WebCodecsSession(() => worker as unknown as Worker);
        worker.emit({ type: 'ready' });

        await session.startCapture({ getAudioTracks: () => [makeTrack()] } as unknown as MediaStream, 'audio', vi.fn());
        await session.startCapture({ getAudioTracks: () => [makeTrack()] } as unknown as MediaStream, 'audio', vi.fn(), 'screen-audio');
        await session.stopCapture('screen-audio');

        expect(readers[1]?.cancel).toHaveBeenCalledOnce();
        expect(readers[0]?.cancel).not.toHaveBeenCalled();
        await session.release();
        vi.unstubAllGlobals();
    });
});