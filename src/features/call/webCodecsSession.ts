import type { CallMediaKind } from './mediaChunker.js';

type WcCodecBase = {
    configure: (config: Record<string, unknown>) => void;
    decode?: (input: unknown) => void;
    flush: () => Promise<void>;
    close: () => void;
    state: string;
};

type WcEncoder = WcCodecBase & {
    encode?: (input: unknown, options?: { keyFrame?: boolean }) => void;
    encodeQueueSize?: number;
    onoutput: ((chunk: { byteLength: number; timestamp: number; type: string; copyTo: (dest: Uint8Array) => void }) => void) | null;
    requestKeyFrame?: boolean;
    requestQueueSize?: number;
};

type WcDecoder = WcCodecBase & {
    onoutput: ((frame: unknown) => void) | null;
};

type WcTrackProcessor = {
    readable: ReadableStream;
};

type WcFrame = {
    sampleRate?: number;
    numberOfChannels?: number;
    timestamp?: number;
    format?: string;
    codedWidth?: number;
    codedHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
};

function globalApi(): Record<string, unknown> {
    return globalThis as unknown as Record<string, unknown>;
}

function chunkToBytes(chunk: { byteLength?: number; copyTo?: (dest: Uint8Array) => void }): Uint8Array {
    const bytes = new Uint8Array(chunk.byteLength ?? 0);
    chunk.copyTo?.(bytes);
    return bytes;
}

export type MediaChunk = { kind: CallMediaKind; bytes: Uint8Array; timestamp: number; keyFrame: boolean };

export class WebCodecsSession {
    private encoders: Partial<Record<CallMediaKind, WcEncoder | null>> = {};
    private decoders: Record<string, { decoder: WcDecoder; onDecoded: (frame: unknown) => void } | null> = {};
    private controllers: Partial<Record<CallMediaKind, ReadableStreamDefaultReader<unknown>>> = {};
    private running = false;

    async startCapture(
        stream: MediaStream,
        kind: CallMediaKind,
        onChunk: (chunk: MediaChunk) => void,
    ): Promise<void> {
        const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (!track) {
            return;
        }
        this.running = true;
        const encoder = this.ensureEncoder(kind, onChunk);
        if (!encoder) {
            return;
        }
        const Processor = globalApi().MediaStreamTrackProcessor as new (opts: { track: MediaStreamTrack }) => WcTrackProcessor;
        if (typeof Processor !== 'function') {
            return;
        }
        const processor = new Processor({ track });
        const reader = processor.readable.getReader();
        this.controllers[kind] = reader;
        void this.pump(reader, kind, encoder).catch(() => undefined);
    }

    private async pump(reader: ReadableStreamDefaultReader<unknown>, kind: CallMediaKind, encoder: WcEncoder): Promise<void> {
        while (this.running) {
            const { value, done } = await reader.read();
            if (done || !value) {
                break;
            }
            if (kind === 'video') {
                const queuedFrames = encoder.encodeQueueSize ?? encoder.requestQueueSize ?? 0;
                if (queuedFrames > 1) {
                    encoder.requestKeyFrame = true;
                    (value as { close?: () => void }).close?.();
                    continue;
                }
            }
            if (encoder.state === 'unconfigured') {
                const frame = value as WcFrame;
                const config = kind === 'audio'
                    ? { codec: 'opus', sampleRate: frame.sampleRate ?? 48000, numberOfChannels: frame.numberOfChannels ?? 1 }
                    : { codec: 'vp8', width: frame.codedWidth ?? 640, height: frame.codedHeight ?? 480, bitrate: 300_000 };
                encoder.configure(config);
                if (kind === 'video') encoder.requestKeyFrame = true;
            }
            if (encoder.encode) {
                try {
                    const keyFrame = kind === 'video' && encoder.requestKeyFrame === true;
                    if (kind === 'video') encoder.requestQueueSize = (encoder.requestQueueSize ?? 0) + 1;
                    encoder.encode(value, keyFrame ? { keyFrame: true } : undefined);
                    if (keyFrame) encoder.requestKeyFrame = false;
                } finally {
                    (value as { close?: () => void }).close?.();
                }
            }
        }
    }

    async decodeChunk(kind: CallMediaKind, bytes: Uint8Array, timestamp: number, keyFrame: boolean, onDecoded: (frame: unknown) => void, streamId = 'default'): Promise<void> {
        const decoderKey = `${kind}:${streamId}`;
        const decoderState = this.ensureDecoder(decoderKey, kind, onDecoded);
        const decoder = decoderState?.decoder;
        if (!decoderState || !decoder?.decode) {
            return;
        }
        decoderState.onDecoded = onDecoded;
        const ChunkCtor = kind === 'audio' ? globalApi().EncodedAudioChunk : globalApi().EncodedVideoChunk;
        if (typeof ChunkCtor !== 'function') {
            return;
        }
        const chunk = new (ChunkCtor as new (init: { type: string; timestamp: number; data: Uint8Array }) => unknown)({
            type: kind === 'audio' || keyFrame ? 'key' : 'delta',
            timestamp,
            data: bytes,
        });
        decoder.decode(chunk);
    }

    async release(): Promise<void> {
        this.running = false;
        for (const reader of Object.values(this.controllers)) {
            try {
                await reader?.cancel();
            } catch {
                // ignore
            }
        }
        this.controllers = {};
        for (const encoder of Object.values(this.encoders)) {
            try {
                await encoder?.flush();
            } catch {
                // ignore
            }
            encoder?.close();
        }
        for (const decoderState of Object.values(this.decoders)) {
            decoderState?.decoder.close();
        }
        this.encoders = {};
        this.decoders = {};
    }

    private ensureEncoder(kind: CallMediaKind, onChunk: (chunk: MediaChunk) => void): WcEncoder | null {
        if (kind in this.encoders) {
            return this.encoders[kind] ?? null;
        }
        const Ctor = globalApi()[kind === 'audio' ? 'AudioEncoder' : 'VideoEncoder'] as new (init: {
            output: (chunk: { byteLength: number; timestamp: number; type: string; copyTo: (dest: Uint8Array) => void }, meta?: WcFrame) => void;
            error: (e: unknown) => void;
        }) => WcEncoder;
        if (typeof Ctor !== 'function') {
            this.encoders[kind] = null;
            return null;
        }
        const encoder = new Ctor({
            output: (chunk) => {
                if (kind === 'video' && encoder.encodeQueueSize === undefined) {
                    encoder.requestQueueSize = Math.max(0, (encoder.requestQueueSize ?? 1) - 1);
                }
                onChunk({ kind, bytes: chunkToBytes(chunk), timestamp: chunk.timestamp, keyFrame: kind === 'audio' || chunk.type === 'key' });
            },
            error: () => undefined,
        });
        this.encoders[kind] = encoder;
        return encoder;
    }

    private ensureDecoder(decoderKey: string, kind: CallMediaKind, onDecoded: (frame: unknown) => void): { decoder: WcDecoder; onDecoded: (frame: unknown) => void } | null {
        if (decoderKey in this.decoders) {
            return this.decoders[decoderKey] ?? null;
        }
        const Ctor = globalApi()[kind === 'audio' ? 'AudioDecoder' : 'VideoDecoder'] as new (init: {
            output: (frame: unknown) => void;
            error: (e: unknown) => void;
        }) => WcDecoder;
        if (typeof Ctor !== 'function') {
            this.decoders[decoderKey] = null;
            return null;
        }
        const decoderState = { decoder: null as unknown as WcDecoder, onDecoded };
        const decoder = new Ctor({
            output: (frame) => decoderState.onDecoded(frame),
            error: () => undefined,
        });
        const config = kind === 'audio' ? { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 } : { codec: 'vp8' };
        decoder.configure(config);
        decoderState.decoder = decoder;
        this.decoders[decoderKey] = decoderState;
        return decoderState;
    }
}
