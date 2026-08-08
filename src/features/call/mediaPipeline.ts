import {
    base64ToBytes,
    bytesToBase64,
    decodeMediaFrame,
    encodeMediaFrame,
    MediaJitterBuffer,
    type CallMediaKind,
    type MediaFrame,
} from './mediaChunker.js';

export interface MediaCodec {
    encode(frame: MediaFrame): Promise<string>;
    decode(kind: CallMediaKind, payload: Uint8Array): Promise<Uint8Array>;
    release(): Promise<void>;
}

export interface MediaTransport {
    sendMedia(data: string): void;
}

export class MediaPipeline {
    private codec: MediaCodec;
    private transport: MediaTransport;
    private seq = 0;
    private jitter = new MediaJitterBuffer();
    private enabled = false;

    constructor(codec: MediaCodec, transport: MediaTransport) {
        this.codec = codec;
        this.transport = transport;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.seq = 0;
            this.jitter.reset();
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    async pushLocalFrame(kind: CallMediaKind, ts: number, data: Uint8Array): Promise<void> {
        if (!this.enabled) {
            return;
        }
        const seq = this.seq++;
        const rawFrame: MediaFrame = { kind, ts, seq, data };
        const payloadBase64 = await this.codec.encode(rawFrame);
        const payload = base64ToBytes(payloadBase64);
        this.transport.sendMedia(encodeMediaFrame({ kind, ts, seq, data: payload }));
    }

    receive(encodedMedia: string): Uint8Array | null {
        const frame = decodeMediaFrame(encodedMedia);
        if (!frame) {
            return null;
        }
        const ordered = this.jitter.push(frame);
        if (!ordered) {
            return null;
        }
        return ordered.data;
    }

    async decodePayload(kind: CallMediaKind, payload: Uint8Array): Promise<Uint8Array> {
        return this.codec.decode(kind, payload);
    }

    reset(): void {
        this.seq = 0;
        this.jitter.reset();
    }
}

export { bytesToBase64 };
