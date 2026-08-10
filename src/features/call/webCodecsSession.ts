import type { CallMediaKind } from './mediaChunker.js';

type WcCodecBase = {
    configure: (config: Record<string, unknown>) => void;
    encode?: (input: unknown) => void;
    decode?: (input: unknown) => void;
    flush: () => Promise<void>;
    close: () => void;
    state: string;
};

type WcEncoder = WcCodecBase & {
    onoutput: ((chunk: { byteLength: number; copyTo: (dest: Uint8Array) => void }) => void) | null;
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

export type MediaChunk = { kind: CallMediaKind; bytes: Uint8Array; meta?: WcFrame };

export class WebCodecsSession {
    private encoders: Partial<Record<CallMediaKind, WcEncoder | null>> = {};
    private decoders: Partial<Record<CallMediaKind, WcDecoder | null>> = {};
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
        this.pump(reader, kind, encoder).catch(() => undefined);
    }

    private async pump(reader: ReadableStreamDefaultReader<unknown>, kind: CallMediaKind, encoder: WcEncoder): Promise<void> {
        while (this.running) {
            const { value, done } = await reader.read();
            if (done || !value) {
                break;
            }
            if (encoder.state === 'unconfigured') {
                const frame = value as WcFrame;
                const config = kind === 'audio'
                    ? { codec: 'opus', sampleRate: frame.sampleRate ?? 48000, numberOfChannels: frame.numberOfChannels ?? 1 }
                    : { codec: 'vp8', width: frame.codedWidth ?? 640, height: frame.codedHeight ?? 480, bitrate: 500_000 };
                encoder.configure(config);
            }
            if (encoder.encode) {
                encoder.encode(value);
            }
        }
    }

    async decodeChunk(kind: CallMediaKind, bytes: Uint8Array, onDecoded: (frame: unknown) => void): Promise<void> {
        const decoder = this.ensureDecoder(kind, onDecoded);
        if (!decoder?.decode) {
            return;
        }
        const ChunkCtor = kind === 'audio' ? globalApi().EncodedAudioChunk : globalApi().EncodedVideoChunk;
        if (typeof ChunkCtor !== 'function') {
            return;
        }
        const chunk = new (ChunkCtor as new (init: { type: string; timestamp: number; data: Uint8Array }) => unknown)({
            type: 'key',
            timestamp: 0,
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
        for (const decoder of Object.values(this.decoders)) {
            decoder?.close();
        }
        this.encoders = {};
        this.decoders = {};
    }

    private ensureEncoder(kind: CallMediaKind, onChunk: (chunk: MediaChunk) => void): WcEncoder | null {
        if (kind in this.encoders) {
            return this.encoders[kind] ?? null;
        }
        const Ctor = globalApi()[kind === 'audio' ? 'AudioEncoder' : 'VideoEncoder'] as new (init: {
            output: (chunk: { byteLength: number; copyTo: (dest: Uint8Array) => void }, meta?: WcFrame) => void;
            error: (e: unknown) => void;
        }) => WcEncoder;
        if (typeof Ctor !== 'function') {
            this.encoders[kind] = null;
            return null;
        }
        const encoder = new Ctor({
            output: (chunk, meta) => {
                onChunk({ kind, bytes: chunkToBytes(chunk), meta });
            },
            error: () => undefined,
        });
        this.encoders[kind] = encoder;
        return encoder;
    }

    private ensureDecoder(kind: CallMediaKind, onDecoded: (frame: unknown) => void): WcDecoder | null {
        if (kind in this.decoders) {
            return this.decoders[kind] ?? null;
        }
        const Ctor = globalApi()[kind === 'audio' ? 'AudioDecoder' : 'VideoDecoder'] as new (init: {
            output: (frame: unknown) => void;
            error: (e: unknown) => void;
        }) => WcDecoder;
        if (typeof Ctor !== 'function') {
            this.decoders[kind] = null;
            return null;
        }
        const decoder = new Ctor({
            output: (frame) => onDecoded(frame),
            error: () => undefined,
        });
        const config = kind === 'audio' ? { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 } : { codec: 'vp8' };
        decoder.configure(config);
        this.decoders[kind] = decoder;
        return decoder;
    }
}
