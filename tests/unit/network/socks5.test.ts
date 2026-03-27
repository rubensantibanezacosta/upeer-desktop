import { describe, it, expect, vi, beforeEach } from 'vitest';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { parseIPv6ToBuffer, encodeFrame, socks5Connect } from '../../../src/main_process/network/server/socks5.js';

type MockSocket = EventEmitter & Pick<net.Socket, 'write' | 'setTimeout' | 'destroy'>;

function createMockSocket(): MockSocket {
    const socket = new EventEmitter() as MockSocket;
    socket.write = vi.fn();
    socket.setTimeout = vi.fn();
    socket.destroy = vi.fn();
    return socket;
}

vi.mock('node:net', () => {
    return {
        default: {
            createConnection: vi.fn()
        }
    };
});

describe('SOCKS5 Unit Tests', () => {

    describe('parseIPv6ToBuffer', () => {
        it('should correctly parse a simple IPv6 address', () => {
            const addr = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
            const buf = parseIPv6ToBuffer(addr);
            expect(buf.length).toBe(16);
            expect(buf.readUInt16BE(0)).toBe(0x2001);
            expect(buf.readUInt16BE(14)).toBe(0x7334);
        });

        it('should correctly parse compressed IPv6 (::1)', () => {
            const buf = parseIPv6ToBuffer('::1');
            expect(buf.readUInt16BE(14)).toBe(1);
            expect(buf.readUInt16BE(0)).toBe(0);
        });

        it('should handle brackets and malformed address', () => {
            expect(parseIPv6ToBuffer('[::1]').readUInt16BE(14)).toBe(1);
            expect(parseIPv6ToBuffer('::G1').readUInt16BE(0)).toBe(0);
        });
    });

    describe('encodeFrame', () => {
        it('should prepend 4-byte big-endian length', () => {
            const data = Buffer.from('hello');
            const framed = encodeFrame(data);
            expect(framed.length).toBe(9);
            expect(framed.readUInt32BE(0)).toBe(5);
        });
    });

    describe('socks5Connect', () => {
        let mockSocket: MockSocket;

        beforeEach(() => {
            mockSocket = createMockSocket();
            vi.mocked(net.createConnection).mockReturnValue(mockSocket);
        });

        it('should complete SOCKS5 handshake successfully', async () => {
            const connPromise = socks5Connect('::1', 50005);
            mockSocket.emit('connect');
            expect(mockSocket.write).toHaveBeenCalledWith(Buffer.from([0x05, 0x01, 0x00]));

            mockSocket.emit('data', Buffer.from([0x05, 0x00]));
            expect(mockSocket.write).toHaveBeenCalledTimes(2);

            mockSocket.emit('data', Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            const socket = await connPromise;
            expect(socket).toBe(mockSocket);
        });

        it('should handle split data in greeting and connect', async () => {
            const connPromise = socks5Connect('::1', 50005);
            mockSocket.emit('connect');

            mockSocket.emit('data', Buffer.from([0x05]));
            mockSocket.emit('data', Buffer.from([0x00])); // Completes greeting

            mockSocket.emit('data', Buffer.from([0x05, 0x00, 0x00]));
            mockSocket.emit('data', Buffer.from([0x01, 0, 0, 0, 0, 0, 0])); // Completes connect

            const socket = await connPromise;
            expect(socket).toBe(mockSocket);
        });

        it('should reject if auth fails', async () => {
            const connPromise = socks5Connect('::1', 50005);
            mockSocket.emit('connect');
            mockSocket.emit('data', Buffer.from([0x05, 0xFF]));
            await expect(connPromise).rejects.toThrow('SOCKS5 auth rechazado');
            expect(mockSocket.destroy).toHaveBeenCalled();
        });

        it('should reject if CONNECT fails', async () => {
            const connPromise = socks5Connect('::1', 50005);
            mockSocket.emit('connect');
            mockSocket.emit('data', Buffer.from([0x05, 0x00]));
            mockSocket.emit('data', Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            await expect(connPromise).rejects.toThrow('SOCKS5 CONNECT fallido');
            expect(mockSocket.destroy).toHaveBeenCalled();
        });

        it('should handle timeout and error', async () => {
            const p1 = socks5Connect('::1', 50005);
            mockSocket.emit('timeout');
            await expect(p1).rejects.toThrow('SOCKS5 timeout');

            const p2 = socks5Connect('::1', 50005);
            mockSocket.emit('error', new Error('ECONNREFUSED'));
            await expect(p2).rejects.toThrow('ECONNREFUSED');
        });
    });
});
