import type { CallMediaKind } from './mediaChunker.js';

type EncodedChunk = { byteLength: number; timestamp: number; type: string; copyTo: (destination: Uint8Array) => void };
type CodecFrame = {
    close?: () => void;
    sampleRate?: number;
    numberOfChannels?: number;
    codedWidth?: number;
    codedHeight?: number;
    timestamp?: number;
};

type WorkerRequest =
    | { type: 'start-capture'; kind: CallMediaKind; track: MediaStreamTrack }
    | { type: 'decode'; kind: CallMediaKind; bytes: ArrayBuffer; timestamp: number; keyFrame: boolean; streamId: string }
    | { type: 'release' };

type WorkerScope = {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
    addEventListener: (type: string, listener: (event: MessageEvent<WorkerRequest>) => void) => void;
};

const workerScope = self as unknown as WorkerScope;
const encoders = new Map<CallMediaKind, VideoEncoder | AudioEncoder>();
const readers = new Map<CallMediaKind, ReadableStreamDefaultReader<VideoFrame | AudioData>>();
const decoders = new Map<string, VideoDecoder | AudioDecoder>();
const decodedFrameQueues = new Map<string, Array<{ kind: CallMediaKind; streamId: string }>>();
let active = true;

function reportError(operation: string, cause: unknown): void {
    workerScope.postMessage({ type: 'error', operation, message: cause instanceof Error ? cause.message : String(cause) });
}

function outputChunk(kind: CallMediaKind, chunk: EncodedChunk): void {
    const bytes = new Uint8Array(chunk.byteLength);
    chunk.copyTo(bytes);
    workerScope.postMessage({ type: 'chunk', kind, bytes: bytes.buffer, timestamp: chunk.timestamp, keyFrame: kind === 'audio' || chunk.type === 'key' }, [bytes.buffer]);
}

function getEncoder(kind: CallMediaKind, frame: CodecFrame): VideoEncoder | AudioEncoder {
    const current = encoders.get(kind);
    if (current) return current;
    const encoder = kind === 'audio'
        ? new AudioEncoder({ output: (chunk) => outputChunk(kind, chunk), error: (cause) => reportError('audio encode', cause) })
        : new VideoEncoder({ output: (chunk) => outputChunk(kind, chunk), error: (cause) => reportError('video encode', cause) });
    if (kind === 'audio') {
        (encoder as AudioEncoder).configure({ codec: 'opus', sampleRate: frame.sampleRate ?? 48000, numberOfChannels: frame.numberOfChannels ?? 1 });
    } else {
        (encoder as VideoEncoder).configure({ codec: 'vp8', width: frame.codedWidth ?? 640, height: frame.codedHeight ?? 480, bitrate: 300_000, framerate: 15 });
    }
    encoders.set(kind, encoder);
    return encoder;
}

async function capture(track: MediaStreamTrack, kind: CallMediaKind): Promise<void> {
    let reader: ReadableStreamDefaultReader<VideoFrame | AudioData> | null = null;
    try {
        const Processor = (globalThis as unknown as { MediaStreamTrackProcessor?: new (options: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame | AudioData> } }).MediaStreamTrackProcessor;
        if (!Processor) throw new Error('MediaStreamTrackProcessor is unavailable in the media worker');
        const processor = new Processor({ track });
        reader = processor.readable.getReader();
        readers.set(kind, reader);
        while (active) {
            const { value, done } = await reader.read();
            if (done || !value) break;
            const frame = value as CodecFrame;
            try {
                const encoder = getEncoder(kind, frame);
                if (kind !== 'audio' && encoder.encodeQueueSize > 1) {
                    continue;
                }
                const requestKeyFrame = kind !== 'audio' && encoder.encodeQueueSize === 0;
                if (kind === 'audio') (encoder as AudioEncoder).encode(value as AudioData);
                else (encoder as VideoEncoder).encode(value as VideoFrame, requestKeyFrame ? { keyFrame: true } : undefined);
            } finally {
                frame.close?.();
            }
        }
    } catch (cause) {
        if (active) reportError(`capture ${kind}`, cause);
    } finally {
        if (readers.get(kind) === reader) readers.delete(kind);
    }
}

function decode(request: Extract<WorkerRequest, { type: 'decode' }>): void {
    const decoderKey = `${request.kind}:${request.streamId}`;
    let decoder = decoders.get(decoderKey);
    if (!decoder) {
        const output = (frame: VideoFrame | AudioData) => {
            const metadata = decodedFrameQueues.get(decoderKey)?.shift();
            if (!metadata) {
                frame.close();
                return;
            }
            workerScope.postMessage({ type: 'decoded', ...metadata, frame }, [frame]);
        };
        decoder = request.kind === 'audio'
            ? new AudioDecoder({ output, error: (cause) => reportError('audio decode', cause) })
            : new VideoDecoder({ output, error: (cause) => reportError('video decode', cause) });
        if (request.kind === 'audio') {
            (decoder as AudioDecoder).configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 });
        } else {
            (decoder as VideoDecoder).configure({ codec: 'vp8' });
        }
        decoders.set(decoderKey, decoder);
    }
    const frameQueue = decodedFrameQueues.get(decoderKey) ?? [];
    frameQueue.push({ kind: request.kind, streamId: request.streamId });
    decodedFrameQueues.set(decoderKey, frameQueue);
    const chunk = request.kind === 'audio'
        ? new EncodedAudioChunk({ type: 'key', timestamp: request.timestamp, data: request.bytes })
        : new EncodedVideoChunk({ type: request.keyFrame ? 'key' : 'delta', timestamp: request.timestamp, data: request.bytes });
    decoder.decode(chunk);
}

function release(): void {
    active = false;
    readers.forEach((reader) => void reader.cancel().catch((cause) => reportError('cancel capture', cause)));
    readers.clear();
    encoders.forEach((encoder) => encoder.close());
    encoders.clear();
    decoders.forEach((decoder) => decoder.close());
    decoders.clear();
    decodedFrameQueues.clear();
}

workerScope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    if (request.type === 'release') {
        release();
        return;
    }
    if (request.type === 'start-capture') {
        void capture(request.track, request.kind);
        return;
    }
    try {
        decode(request);
    } catch (cause) {
        reportError('decode', cause);
    }
});

workerScope.postMessage({ type: 'ready' });