import type { CallMediaKind } from './mediaChunker.js';

export type MediaChunk = { kind: CallMediaKind; bytes: Uint8Array; timestamp: number; keyFrame: boolean };

type WorkerMessage =
    | { type: 'ready' }
    | { type: 'chunk'; kind: CallMediaKind; bytes: ArrayBuffer; timestamp: number; keyFrame: boolean }
    | { type: 'speaker'; active: boolean }
    | { type: 'decoded'; kind: CallMediaKind; streamId: string; frame: VideoFrame | AudioData }
    | { type: 'diagnostic'; message: string; details: Record<string, unknown> }
    | { type: 'error'; operation: string; message: string };

export type VideoQuality = { bitrate: number; framerate: number };

type WorkerLike = Pick<Worker, 'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'>;
type WorkerFactory = () => WorkerLike;
type MediaFrameReader = ReadableStreamDefaultReader<VideoFrame | AudioData>;
type CaptureTrack = MediaStreamTrack & { stop: () => void };

function createMediaWorker(): WorkerLike {
    return new Worker(new URL('./mediaCodec.worker.ts', import.meta.url), { type: 'module' });
}

export class WebCodecsSession {
    private worker: WorkerLike | null;
    private ready: Promise<void>;
    private captureReaders = new Map<string, MediaFrameReader>();
    private captureTracks = new Map<string, CaptureTrack>();
    private chunkHandlers = new Map<CallMediaKind, (chunk: MediaChunk) => void>();
    private decodedHandlers = new Map<string, (frame: VideoFrame | AudioData) => void>();
    private speakerHandler: ((active: boolean) => void) | null = null;

    constructor(workerFactory: WorkerFactory = createMediaWorker) {
        this.worker = workerFactory();
        this.ready = new Promise((resolve, reject) => {
            const worker = this.worker;
            if (!worker) return reject(new Error('Media worker unavailable'));
            const onMessage = (event: MessageEvent<WorkerMessage>) => {
                if (event.data.type === 'ready') {
                    worker.removeEventListener('message', onMessage);
                    resolve();
                }
            };
            worker.addEventListener('message', onMessage);
            worker.addEventListener('error', (event: ErrorEvent) => {
                const cause = new Error(`Media worker failed: ${event.message || 'unknown worker error'}`);
                console.error(cause.message, { filename: event.filename, lineno: event.lineno, colno: event.colno });
                reject(cause);
            }, { once: true });
        });
        this.worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            if (message.type === 'chunk') {
                this.chunkHandlers.get(message.kind)?.({ kind: message.kind, bytes: new Uint8Array(message.bytes), timestamp: message.timestamp, keyFrame: message.keyFrame });
            } else if (message.type === 'speaker') {
                this.speakerHandler?.(message.active);
            } else if (message.type === 'decoded') {
                const handler = this.decodedHandlers.get(`${message.kind}:${message.streamId}`);
                if (handler) handler(message.frame);
                else message.frame.close();
            } else if (message.type === 'error') {
                console.error(`Call media worker ${message.operation} failed: ${message.message}`);
            } else if (message.type === 'diagnostic') {
                console.info(`[call] ${message.message}`, message.details);
            }
        });
    }

    async startCapture(stream: MediaStream, kind: CallMediaKind, onChunk: (chunk: MediaChunk) => void, captureId: string = kind, onSpeakerState?: (active: boolean) => void): Promise<void> {
        const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (!track || this.captureReaders.has(captureId)) return;
        await this.ready;
        const Processor = (globalThis as unknown as {
            MediaStreamTrackProcessor?: new (options: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame | AudioData> };
        }).MediaStreamTrackProcessor;
        if (!Processor) throw new Error('MediaStreamTrackProcessor is unavailable in the renderer');
        const clonedTrack = track.clone();
        let reader: MediaFrameReader;
        try {
            reader = new Processor({ track: clonedTrack }).readable.getReader();
        } catch (cause) {
            clonedTrack.stop();
            throw cause;
        }
        this.chunkHandlers.set(kind, onChunk);
        if (onSpeakerState) {
            this.speakerHandler = onSpeakerState;
            this.worker?.postMessage({ type: 'speaker-detection', enabled: true, captureId });
        }
        this.captureReaders.set(captureId, reader);
        this.captureTracks.set(captureId, clonedTrack);
        void this.forwardFrames(reader, kind, captureId);
    }

    async stopCapture(captureId: string): Promise<void> {
        const reader = this.captureReaders.get(captureId);
        this.captureReaders.delete(captureId);
        this.worker?.postMessage({ type: 'speaker-detection', enabled: false, captureId });
        const track = this.captureTracks.get(captureId);
        this.captureTracks.delete(captureId);
        track?.stop();
        if (reader) await reader.cancel();
        this.worker?.postMessage({ type: 'stop-capture', captureId, kind: captureId === 'screen' ? 'screen' : 'audio' });
    }

    setVideoQuality(quality: VideoQuality): void {
        this.worker?.postMessage({ type: 'video-quality', quality });
    }

    private async forwardFrames(reader: MediaFrameReader, kind: CallMediaKind, captureId: string): Promise<void> {
        try {
            while (this.worker && this.captureReaders.get(captureId) === reader) {
                const { value, done } = await reader.read();
                if (done || !value) break;
                try {
                    this.worker?.postMessage({ type: 'encode-frame', kind, frame: value, captureId }, [value]);
                } catch (cause) {
                    value.close();
                    throw cause;
                }
            }
        } catch (cause) {
            if (this.worker) console.error(`Call media ${kind} frame forwarding failed`, cause);
        } finally {
            if (this.captureReaders.get(captureId) === reader) this.captureReaders.delete(captureId);
        }
    }

    async decodeChunk(kind: CallMediaKind, bytes: Uint8Array, timestamp: number, keyFrame: boolean, onDecoded: (frame: VideoFrame | AudioData) => void, streamId = 'default'): Promise<void> {
        await this.ready;
        this.decodedHandlers.set(`${kind}:${streamId}`, onDecoded);
        const data = bytes.slice();
        this.worker?.postMessage({ type: 'decode', kind, bytes: data.buffer, timestamp, keyFrame, streamId }, [data.buffer]);
    }

    async release(): Promise<void> {
        const worker = this.worker;
        this.worker = null;
        this.captureReaders.forEach((reader) => void reader.cancel().catch((cause: unknown) => {
            console.warn('Call media frame reader stopped before release:', cause);
        }));
        this.captureReaders.clear();
        this.captureTracks.forEach((track) => track.stop());
        this.captureTracks.clear();
        this.chunkHandlers.clear();
        this.decodedHandlers.clear();
        this.speakerHandler = null;
        if (!worker) return;
        await this.ready.then(() => worker.postMessage({ type: 'release' })).catch((cause: unknown) => {
            console.warn('Call media worker stopped before release:', cause);
        });
        worker.terminate();
    }
}