import { randomBytes } from 'node:crypto';
import { CALL_MEDIA_UDP_MAX_BYTES } from './constants.js';

const FRAGMENT_MAGIC = Buffer.from([0x55, 0x43, 0x46, 0x31]);
const FRAGMENT_HEADER_BYTES = 28;
const MAX_ASSEMBLIES = 64;
const ASSEMBLY_TTL_MS = 5000;
const MAX_FRAGMENT_COUNT = 512;
const MAX_PACKET_BYTES = 600_000;
const MAX_FRAGMENT_PAYLOAD_BYTES = CALL_MEDIA_UDP_MAX_BYTES - FRAGMENT_HEADER_BYTES;

type Assembly = {
    count: number;
    totalBytes: number;
    parts: Map<number, Buffer>;
    receivedBytes: number;
    timer: ReturnType<typeof setTimeout>;
};

const assemblies = new Map<string, Assembly>();

export function fragmentCallMediaPacket(packet: Buffer, maxDatagramBytes = CALL_MEDIA_UDP_MAX_BYTES): Buffer[] {
    if (maxDatagramBytes > CALL_MEDIA_UDP_MAX_BYTES) throw new Error('CALL_MEDIA UDP fragment exceeds the configured datagram size');
    if (packet.length <= maxDatagramBytes) return [packet];
    const payloadBytes = maxDatagramBytes - FRAGMENT_HEADER_BYTES;
    const count = Math.ceil(packet.length / payloadBytes);
    if (payloadBytes <= 0 || packet.length > MAX_PACKET_BYTES || count > MAX_FRAGMENT_COUNT) {
        throw new Error(`CALL_MEDIA packet exceeds UDP fragmentation limits (${packet.length} bytes)`);
    }
    const id = randomBytes(16);
    const fragments: Buffer[] = [];
    for (let index = 0; index < count; index += 1) {
        const start = index * payloadBytes;
        const part = packet.subarray(start, Math.min(start + payloadBytes, packet.length));
        const fragment = Buffer.allocUnsafe(FRAGMENT_HEADER_BYTES + part.length);
        FRAGMENT_MAGIC.copy(fragment, 0);
        id.copy(fragment, 4);
        fragment.writeUInt16BE(index, 20);
        fragment.writeUInt16BE(count, 22);
        fragment.writeUInt32BE(packet.length, 24);
        part.copy(fragment, FRAGMENT_HEADER_BYTES);
        fragments.push(fragment);
    }
    return fragments;
}

export function reassembleCallMediaDatagram(datagram: Buffer): Buffer | null {
    if (datagram.length < FRAGMENT_MAGIC.length || !datagram.subarray(0, 4).equals(FRAGMENT_MAGIC)) return datagram;
    if (datagram.length <= FRAGMENT_HEADER_BYTES) return null;
    const id = datagram.subarray(4, 20).toString('hex');
    const index = datagram.readUInt16BE(20);
    const count = datagram.readUInt16BE(22);
    const totalBytes = datagram.readUInt32BE(24);
    const part = datagram.subarray(FRAGMENT_HEADER_BYTES);
    if (
        count < 2
        || count > MAX_FRAGMENT_COUNT
        || index >= count
        || totalBytes > MAX_PACKET_BYTES
        || totalBytes <= (count - 1) * MAX_FRAGMENT_PAYLOAD_BYTES
        || totalBytes > count * MAX_FRAGMENT_PAYLOAD_BYTES
        || part.length > MAX_FRAGMENT_PAYLOAD_BYTES
    ) return null;
    let assembly = assemblies.get(id);
    if (!assembly) {
        if (assemblies.size >= MAX_ASSEMBLIES) {
            const oldestId = assemblies.keys().next().value;
            if (oldestId) removeAssembly(oldestId);
        }
        const timer = setTimeout(() => removeAssembly(id), ASSEMBLY_TTL_MS);
        timer.unref();
        assembly = { count, totalBytes, parts: new Map(), receivedBytes: 0, timer };
        assemblies.set(id, assembly);
    }
    if (assembly.count !== count || assembly.totalBytes !== totalBytes) {
        removeAssembly(id);
        return null;
    }
    if (!assembly.parts.has(index)) {
        if (assembly.receivedBytes + part.length > totalBytes) {
            removeAssembly(id);
            return null;
        }
        assembly.parts.set(index, Buffer.from(part));
        assembly.receivedBytes += part.length;
    }
    if (assembly.parts.size !== count) return null;
    if (assembly.receivedBytes !== totalBytes) {
        removeAssembly(id);
        return null;
    }
    const packet = Buffer.concat(Array.from({ length: count }, (_, partIndex) => assembly?.parts.get(partIndex) ?? Buffer.alloc(0)), totalBytes);
    removeAssembly(id);
    return packet.length === totalBytes ? packet : null;
}

export function clearCallMediaAssemblies(): void {
    for (const id of assemblies.keys()) removeAssembly(id);
}

function removeAssembly(id: string): void {
    const assembly = assemblies.get(id);
    if (!assembly) return;
    clearTimeout(assembly.timer);
    assemblies.delete(id);
}