import dgram from 'node:dgram';
import net from 'node:net';
import { SOCKS5_HOST, SOCKS5_PORT } from './constants.js';

const MAX_SOCKS_DATAGRAM_BYTES = 65507;

export type Socks5UdpAssociation = {
    send: (address: string, port: number, payload: Buffer, onError?: (error: Error) => void) => boolean;
    isOpen: () => boolean;
    close: () => void;
};

type SocksAddress = { host: string; port: number };

export function sameIPv6Address(first: string, second: string): boolean {
    const firstBytes = encodeIPv6(first);
    const secondBytes = encodeIPv6(second);
    return firstBytes !== null && secondBytes !== null && firstBytes.equals(secondBytes);
}

export async function createSocks5UdpAssociation(
    onDatagram: (payload: Buffer, address: string, port: number) => void,
    socksHost = SOCKS5_HOST,
    socksPort = SOCKS5_PORT,
): Promise<Socks5UdpAssociation> {
    const socket = dgram.createSocket('udp4');
    const control = net.createConnection({ host: socksHost, port: socksPort });
    let closed = false;
    let controlClosed = false;
    let socketClosed = false;
    let socketBound = false;
    const cleanup = () => {
        closed = true;
        if (!controlClosed) {
            controlClosed = true;
            control.destroy();
        }
        if (!socketClosed && socketBound) {
            socketClosed = true;
            socket.close();
        }
    };
    control.on('error', cleanup);
    control.on('timeout', () => {
        cleanup();
        control.destroy(new Error('SOCKS5 UDP control connection timed out'));
    });

    try {
        await waitForConnect(control);
        const greeting = await exchange(control, Buffer.from([5, 1, 0]), 2);
        if (greeting[0] !== 5 || greeting[1] !== 0) throw new Error('SOCKS5 UDP association requires no-auth support');
        const controlAddress = control.localAddress;
        if (!controlAddress || !net.isIPv4(controlAddress)) throw new Error('SOCKS5 control connection has no IPv4 local address');
        const associateRequest = Buffer.concat([Buffer.from([5, 3, 0, 1]), ipv4Bytes(controlAddress), Buffer.from([0, 0])]);
        const response = await exchangeVariable(control, associateRequest);
        const relay = decodeSocksAddress(response);
        if (response[1] !== 0 || relay.port === 0) throw new Error(`SOCKS5 UDP ASSOCIATE failed with status ${response[1]}`);
        if (relay.host === '0.0.0.0') relay.host = controlAddress;
        const relayHost = await resolveIPv4(relay.host);

        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject);
            socket.bind(0, controlAddress, resolve);
        });
        socketBound = true;
        control.setTimeout(0);
        socket.on('error', cleanup);
        control.on('close', cleanup);
        socket.on('message', (frame, remote) => {
            if (remote.address !== relayHost || remote.port !== relay.port) return;
            const decoded = decodeSocksDatagram(frame);
            if (decoded) onDatagram(decoded.payload, decoded.address, decoded.port);
        });

        return {
            send: (address, port, payload, onError) => {
                const target = encodeIPv6(address);
                if (closed || !target || !validPort(port) || payload.length > 1200) return false;
                const header = Buffer.alloc(22);
                header[3] = 4;
                target.copy(header, 4);
                header.writeUInt16BE(port, 20);
                const frame = Buffer.concat([header, payload]);
                if (frame.length > MAX_SOCKS_DATAGRAM_BYTES) return false;
                try {
                    socket.send(frame, relay.port, relayHost, (cause) => {
                        if (cause) onError?.(cause);
                    });
                } catch {
                    return false;
                }
                return true;
            },
            isOpen: () => !closed && !control.destroyed && !socketClosed,
            close: cleanup,
        };
    } catch (cause) {
        cleanup();
        throw cause;
    }
}

function waitForConnect(socket: net.Socket): Promise<void> {
    return new Promise((resolve, reject) => {
        socket.setTimeout(5000, () => reject(new Error('SOCKS5 UDP control connection timed out')));
        socket.once('connect', () => {
            socket.setTimeout(0);
            resolve();
        });
        socket.once('error', reject);
    });
}

function exchange(socket: net.Socket, request: Buffer, responseBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        let received = Buffer.alloc(0);
        const timer = setTimeout(() => finish(new Error('SOCKS5 handshake timed out')), 5000);
        const onData = (chunk: Buffer) => {
            received = Buffer.concat([received, chunk]);
            if (received.length < responseBytes) return;
            const response = received.subarray(0, responseBytes);
            const remaining = received.subarray(responseBytes);
            if (remaining.length > 0) socket.unshift(remaining);
            finish(undefined, response);
        };
        const onError = (error: Error) => {
            finish(error);
        };
        const finish = (error?: Error, response?: Buffer) => {
            clearTimeout(timer);
            socket.off('data', onData);
            socket.off('error', onError);
            if (error) reject(error);
            else if (response) resolve(response);
        };
        socket.on('data', onData);
        socket.once('error', onError);
        socket.write(request);
    });
}

function exchangeVariable(socket: net.Socket, request: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        let received = Buffer.alloc(0);
        const timer = setTimeout(() => finish(new Error('SOCKS5 handshake timed out')), 5000);
        const onData = (chunk: Buffer) => {
            received = Buffer.concat([received, chunk]);
            let expected: number;
            try {
                expected = socksAddressLength(received);
            } catch (cause) {
                finish(cause instanceof Error ? cause : new Error(String(cause)));
                return;
            }
            if (received.length < expected) return;
            const response = received.subarray(0, expected);
            const remaining = received.subarray(expected);
            if (remaining.length > 0) socket.unshift(remaining);
            finish(undefined, response);
        };
        const onError = (error: Error) => {
            finish(error);
        };
        const finish = (error?: Error, response?: Buffer) => {
            clearTimeout(timer);
            socket.off('data', onData);
            socket.off('error', onError);
            if (error) reject(error);
            else if (response) resolve(response);
        };
        socket.on('data', onData);
        socket.once('error', onError);
        socket.write(request);
    });
}

function socksAddressLength(response: Buffer): number {
    if (response.length < 4) return Number.MAX_SAFE_INTEGER;
    if (response[3] === 1) return 10;
    if (response[3] === 4) return 22;
    if (response[3] === 3) return response.length < 5 ? Number.MAX_SAFE_INTEGER : 7 + response[4];
    throw new Error('SOCKS5 returned an unsupported relay address type');
}

function decodeSocksAddress(response: Buffer): SocksAddress {
    if (response.length < 4 || response[0] !== 5) throw new Error('Invalid SOCKS5 UDP relay response');
    const type = response[3];
    let host: string;
    let offset: number;
    if (type === 1 && response.length >= 10) {
        host = Array.from(response.subarray(4, 8)).join('.');
        offset = 8;
    } else if (type === 4 && response.length >= 22) {
        host = Array.from({ length: 8 }, (_, index) => response.readUInt16BE(4 + index * 2).toString(16)).join(':');
        offset = 20;
    } else if (type === 3 && response.length >= 7 + response[4]) {
        host = response.subarray(5, 5 + response[4]).toString('utf8');
        offset = 5 + response[4];
    } else {
        throw new Error('Malformed SOCKS5 UDP relay address');
    }
    return { host, port: response.readUInt16BE(offset) };
}

function decodeSocksDatagram(frame: Buffer): { address: string; port: number; payload: Buffer } | null {
    if (frame.length < 10 || frame[0] !== 0 || frame[1] !== 0 || frame[2] !== 0) return null;
    const type = frame[3];
    if (type === 1) {
        return {
            address: Array.from(frame.subarray(4, 8)).join('.'),
            port: frame.readUInt16BE(8),
            payload: frame.subarray(10),
        };
    }
    if (type === 4 && frame.length >= 22) {
        const address = Array.from({ length: 8 }, (_, index) => frame.readUInt16BE(4 + index * 2).toString(16)).join(':');
        return { address, port: frame.readUInt16BE(20), payload: frame.subarray(22) };
    }
    return null;
}

async function resolveIPv4(host: string): Promise<string> {
    if (net.isIPv4(host)) return host;
    const lookup = await import('node:dns/promises');
    const resolved = await lookup.lookup(host, { family: 4 });
    return resolved.address;
}

function ipv4Bytes(address: string): Buffer {
    if (!net.isIPv4(address)) throw new Error('Invalid IPv4 address');
    return Buffer.from(address.split('.').map(Number));
}

function encodeIPv6(address: string): Buffer | null {
    const normalized = address.replace(/[[\]]/g, '');
    if (!net.isIPv6(normalized) || (normalized.match(/::/g) ?? []).length > 1) return null;
    const halves = normalized.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
    const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
    const output = Buffer.alloc(16);
    groups.forEach((group, index) => output.writeUInt16BE(parseInt(group, 16), index * 2));
    return output;
}

function validPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port <= 65535;
}