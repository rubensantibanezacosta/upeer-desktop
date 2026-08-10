import { bytesToBase64, base64ToBytes, type CallMediaKind, type MediaFrame } from './mediaChunker.js';
import type { MediaCodec } from './mediaPipeline.js';

export class PassthroughMediaCodec implements MediaCodec {
    async encode(frame: MediaFrame): Promise<string> {
        return bytesToBase64(frame.data);
    }

    async decode(_kind: CallMediaKind, payload: Uint8Array): Promise<Uint8Array> {
        return payload;
    }

    async release(): Promise<void> {
        return undefined;
    }
}

type WebCodecBase = {
    configure: (config: Record<string, unknown>) => void;
    encode: (input: unknown) => void;
    decode: (input: unknown) => void;
    flush: () => Promise<void>;
    close: () => void;
};

type WebCodecConstructor = {
    new (init: {
        output?: (chunk: { byteLength?: number; copyTo?: (target: Uint8Array) => void }) => void;
        error?: (e: unknown) => void;
    }): WebCodecBase;
};

function getConstructor(name: string): WebCodecConstructor | null {
    const ctor = (globalThis as unknown as Record<string, unknown>)[name];
    return typeof ctor === 'function' ? (ctor as WebCodecConstructor) : null;
}

export function isWebCodecsAvailable(): boolean {
    return Boolean(getConstructor('AudioEncoder')) || Boolean(getConstructor('VideoEncoder'));
}

export class WebCodecsMediaCodec implements MediaCodec {
    private encoders: Partial<Record<CallMediaKind, WebCodecBase | null>> = {};
    private decoders: Partial<Record<CallMediaKind, WebCodecBase | null>> = {};
    private pending: Array<(payload: string) => void> = [];

    async encode(frame: MediaFrame): Promise<string> {
        const encoder = this.ensureEncoder(frame.kind);
        if (!encoder) {
            return bytesToBase64(frame.data);
        }
        return new Promise<string>((resolve) => {
            this.pending.push(resolve);
            encoder.encode(this.toInput(frame));
            void encoder.flush().catch(() => undefined);
        });
    }

    async decode(kind: CallMediaKind, payload: Uint8Array): Promise<Uint8Array> {
        return this.ensureDecoder(kind) ? payload : payload;
    }

    async release(): Promise<void> {
        for (const encoder of Object.values(this.encoders)) {
            encoder?.close();
        }
        for (const decoder of Object.values(this.decoders)) {
            decoder?.close();
        }
        this.encoders = {};
        this.decoders = {};
        this.pending = [];
    }

    private ensureEncoder(kind: CallMediaKind): WebCodecBase | null {
        if (kind in this.encoders) {
            return this.encoders[kind] ?? null;
        }
        const ctorName = kind === 'audio' ? 'AudioEncoder' : 'VideoEncoder';
        const Ctor = getConstructor(ctorName);
        if (!Ctor) {
            this.encoders[kind] = null;
            return null;
        }
        const encoder = new Ctor({
            output: (chunk) => {
                const resolve = this.pending.shift();
                if (!resolve) {
                    return;
                }
                const bytes = this.chunkToBytes(chunk);
                resolve(bytesToBase64(bytes));
            },
            error: () => undefined,
        });
        const config = kind === 'audio'
            ? { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 }
            : { codec: 'vp8', width: 640, height: 480, bitrate: 300_000 };
        encoder.configure(config);
        this.encoders[kind] = encoder;
        return encoder;
    }

    private ensureDecoder(kind: CallMediaKind): WebCodecBase | null {
        if (kind in this.decoders) {
            return this.decoders[kind] ?? null;
        }
        const ctorName = kind === 'audio' ? 'AudioDecoder' : 'VideoDecoder';
        const Ctor = getConstructor(ctorName);
        if (!Ctor) {
            this.decoders[kind] = null;
            return null;
        }
        const decoder = new Ctor({ output: () => undefined, error: () => undefined });
        const config = kind === 'audio'
            ? { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 }
            : { codec: 'vp8' };
        decoder.configure(config);
        this.decoders[kind] = decoder;
        return decoder;
    }

    private toInput(frame: MediaFrame): unknown {
        if (frame.kind === 'audio') {
            return { timestamp: frame.ts, data: frame.data };
        }
        return { timestamp: frame.ts, data: frame.data, codedWidth: 640, codedHeight: 480 };
    }

    private chunkToBytes(chunk: { byteLength?: number; copyTo?: (target: Uint8Array) => void }): Uint8Array {
        const length = chunk.byteLength ?? 0;
        const bytes = new Uint8Array(length);
        chunk.copyTo?.(bytes);
        return bytes;
    }
}

export function createMediaCodec(): MediaCodec {
    return isWebCodecsAvailable() ? new WebCodecsMediaCodec() : new PassthroughMediaCodec();
}

export { base64ToBytes, bytesToBase64 };
