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
    | { type: 'encode-frame'; kind: CallMediaKind; frame: VideoFrame | AudioData }
    | { type: 'speaker-detection'; enabled: boolean; captureId: string }
    | { type: 'decode'; kind: CallMediaKind; bytes: ArrayBuffer; timestamp: number; keyFrame: boolean; streamId: string }
    | { type: 'release' };

type WorkerScope = {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
    addEventListener: (type: string, listener: (event: MessageEvent<WorkerRequest>) => void) => void;
};

const workerScope = self as unknown as WorkerScope;
const encoders = new Map<CallMediaKind, VideoEncoder | AudioEncoder>();
const decoders = new Map<string, VideoDecoder | AudioDecoder>();
const decodedFrameQueues = new Map<string, Array<{ kind: CallMediaKind; streamId: string }>>();
const decoderDiagnostics = new Set<string>();
const speakerDetectionStreams = new Set<string>();
let speakerActive = false;
let lastSpeakerChangeAt = 0;

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

function encodeFrame(frame: VideoFrame | AudioData, kind: CallMediaKind): void {
    try {
        const codecFrame = frame as CodecFrame;
        if (kind === 'audio' && speakerDetectionStreams.size > 0) detectSpeaker(frame as AudioData);
        const encoder = getEncoder(kind, codecFrame);
        if (kind !== 'audio' && encoder.encodeQueueSize > 1) return;
        const requestKeyFrame = kind !== 'audio' && encoder.encodeQueueSize === 0;
        if (kind === 'audio') (encoder as AudioEncoder).encode(frame as AudioData);
        else (encoder as VideoEncoder).encode(frame as VideoFrame, requestKeyFrame ? { keyFrame: true } : undefined);
    } catch (cause) {
        reportError(`encode ${kind}`, cause);
    } finally {
        frame.close();
    }
}

function detectSpeaker(audio: AudioData): void {
    const samples = audio.numberOfFrames;
    const pcm = new Float32Array(samples);
    audio.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' });
    let energy = 0;
    for (const sample of pcm) energy += sample * sample;
    const active = Math.sqrt(energy / Math.max(samples, 1)) > 0.025;
    const now = Date.now();
    if (active === speakerActive) {
        if (!active || now - lastSpeakerChangeAt < 650) return;
        lastSpeakerChangeAt = now;
        workerScope.postMessage({ type: 'speaker', active: true });
        return;
    }
    if (now - lastSpeakerChangeAt < (active ? 120 : 650)) return;
    speakerActive = active;
    lastSpeakerChangeAt = now;
    workerScope.postMessage({ type: 'speaker', active });
}

function decode(request: Extract<WorkerRequest, { type: 'decode' }>): void {
    const decoderKey = `${request.kind}:${request.streamId}`;
    let decoder = decoders.get(decoderKey);
    if (!decoder) {
        reportDecodeDiagnostic(`${decoderKey}:created`, 'Remote media decoder created', { kind: request.kind, streamId: request.streamId });
        const output = (frame: VideoFrame | AudioData) => {
            const metadata = decodedFrameQueues.get(decoderKey)?.shift();
            if (!metadata) {
                reportDecodeDiagnostic(`${decoderKey}:output-without-request`, 'WebCodecs emitted a remote frame without matching decode metadata', { decoderKey });
                frame.close();
                return;
            }
            reportDecodeDiagnostic(`${decoderKey}:output`, 'WebCodecs emitted a decoded remote frame', { kind: metadata.kind, streamId: metadata.streamId });
            workerScope.postMessage({ type: 'decoded', ...metadata, frame }, [frame]);
        };
        decoder = request.kind === 'audio'
            ? new AudioDecoder({ output, error: (cause) => { reportError('audio decode', cause); reportDecodeDiagnostic(`${decoderKey}:error`, 'WebCodecs remote audio decoder error', { streamId: request.streamId, error: cause.message }); } })
            : new VideoDecoder({ output, error: (cause) => { reportError('video decode', cause); reportDecodeDiagnostic(`${decoderKey}:error`, 'WebCodecs remote video decoder error', { streamId: request.streamId, error: cause.message }); } });
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
    reportDecodeDiagnostic(`${decoderKey}:queued`, 'Encoded remote media chunk queued in WebCodecs', { kind: request.kind, streamId: request.streamId, keyFrame: request.keyFrame, bytes: request.bytes.byteLength, decoderState: decoder.state });
}

function reportDecodeDiagnostic(key: string, message: string, details: Record<string, unknown>): void {
    if (decoderDiagnostics.has(key)) return;
    decoderDiagnostics.add(key);
    workerScope.postMessage({ type: 'diagnostic', message, details });
}

function release(): void {
    encoders.forEach((encoder) => {
        if (encoder.state !== 'closed') encoder.close();
    });
    encoders.clear();
    decoders.forEach((decoder) => decoder.close());
    decoders.clear();
    decodedFrameQueues.clear();
    decoderDiagnostics.clear();
    speakerDetectionStreams.clear();
    speakerActive = false;
    lastSpeakerChangeAt = 0;
}

workerScope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    if (request.type === 'release') {
        release();
        return;
    }
    if (request.type === 'speaker-detection') {
        if (request.enabled) speakerDetectionStreams.add(request.captureId);
        else speakerDetectionStreams.delete(request.captureId);
        return;
    }
    if (request.type === 'encode-frame') {
        encodeFrame(request.frame, request.kind);
        return;
    }
    try {
        decode(request);
    } catch (cause) {
        reportError('decode', cause);
    }
});

workerScope.postMessage({ type: 'ready' });