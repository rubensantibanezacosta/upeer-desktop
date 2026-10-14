import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalStringify } from './cryptoUtils.js';

const MAGIC = Buffer.from([0x55, 0x43, 0x4d, 0x31]);
const HEADER_BYTES = 8;

export function hashCallMedia(data: Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
}

export function callMediaSignatureValue(packet: Record<string, unknown>): string {
    return canonicalStringify(packet);
}

export function encodeBinaryCallMedia(packet: Record<string, unknown>, data: Uint8Array): Buffer {
    const metadataPacket = { ...packet };
    delete metadataPacket.data;
    const metadata = Buffer.from(JSON.stringify(metadataPacket));
    const header = Buffer.alloc(HEADER_BYTES);
    MAGIC.copy(header, 0);
    header.writeUInt32BE(metadata.length, 4);
    return Buffer.concat([header, metadata, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
}

export function decodeBinaryCallMedia(frame: Buffer): Record<string, unknown> | null {
    if (frame.length < HEADER_BYTES || !frame.subarray(0, 4).equals(MAGIC)) return null;
    const metadataLength = frame.readUInt32BE(4);
    if (metadataLength === 0 || metadataLength > frame.length - HEADER_BYTES) return null;
    try {
        const metadata: unknown = JSON.parse(frame.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength).toString('utf8'));
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
        const packet = metadata as Record<string, unknown>;
        if (packet.type !== 'CALL_MEDIA' || typeof packet.mediaHash !== 'string' || !/^[0-9a-f]{64}$/i.test(packet.mediaHash)) return null;
        const data = frame.subarray(HEADER_BYTES + metadataLength);
        const expected = Buffer.from(packet.mediaHash, 'hex');
        const actual = Buffer.from(hashCallMedia(data), 'hex');
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
        packet.data = new Uint8Array(data);
        return packet;
    } catch {
        return null;
    }
}

export function isBinaryCallMedia(frame: Buffer): boolean {
    return frame.length >= MAGIC.length && frame.subarray(0, MAGIC.length).equals(MAGIC);
}