export type CallMediaKind = 'audio' | 'video';

export interface MediaFrame {
    kind: CallMediaKind;
    ts: number;
    seq: number;
    data: Uint8Array;
}

const HEADER_BYTES = 16;

export function encodeMediaFrame(frame: MediaFrame): string {
    const header = new Uint8Array(HEADER_BYTES);
    const view = new DataView(header.buffer);
    view.setUint8(0, frame.kind === 'video' ? 1 : 0);
    view.setFloat64(4, frame.ts);
    view.setUint32(12, frame.seq >>> 0);

    const out = new Uint8Array(HEADER_BYTES + frame.data.length);
    out.set(header, 0);
    out.set(frame.data, HEADER_BYTES);

    let binary = '';
    for (let i = 0; i < out.length; i++) {
        binary += String.fromCharCode(out[i]);
    }
    return btoa(binary);
}

export function decodeMediaFrame(encoded: string): MediaFrame | null {
    let binary: string;
    try {
        binary = atob(encoded);
    } catch {
        return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length < HEADER_BYTES) {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
    const kind: CallMediaKind = view.getUint8(0) === 1 ? 'video' : 'audio';
    const ts = view.getFloat64(4);
    const seq = view.getUint32(12);
    const data = new Uint8Array(bytes.subarray(HEADER_BYTES));
    return { kind, ts, seq, data };
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export class MediaJitterBuffer {
    private capacity: number;
    private entries = new Map<number, MediaFrame>();
    private nextExpected = 0;

    constructor(capacity = 200) {
        this.capacity = capacity;
    }

    push(frame: MediaFrame): MediaFrame | null {
        if (frame.seq < this.nextExpected) {
            return null;
        }
        this.entries.set(frame.seq, frame);
        while (this.entries.size > this.capacity) {
            let oldest = Number.POSITIVE_INFINITY;
            let oldestSeq = -1;
            for (const seq of this.entries.keys()) {
                if (seq < oldest) {
                    oldest = seq;
                    oldestSeq = seq;
                }
            }
            if (oldestSeq < 0) break;
            this.entries.delete(oldestSeq);
        }
        const next = this.entries.get(this.nextExpected);
        if (next) {
            this.entries.delete(this.nextExpected);
            this.nextExpected += 1;
            return next;
        }
        return null;
    }

    reset(): void {
        this.entries.clear();
        this.nextExpected = 0;
    }
}
