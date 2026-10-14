import dgram from 'node:dgram';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createSocks5UdpAssociation, sameIPv6Address } from '../../../src/main_process/network/server/socks5Udp.js';
import { CALL_MEDIA_UDP_PORT } from '../../../src/main_process/network/server/constants.js';

describe('SOCKS5 UDP association', () => {
    const closers: Array<() => void> = [];

    afterEach(() => {
        for (const close of closers.splice(0)) close();
    });

    it('performs UDP ASSOCIATE and round-trips an IPv6-targeted datagram', async () => {
        const relay = dgram.createSocket('udp4');
        closers.push(() => relay.close());
        await new Promise<void>((resolve) => relay.bind(0, '127.0.0.1', resolve));
        relay.on('message', (frame: Buffer, remote) => {
            expect(frame.subarray(0, 3)).toEqual(Buffer.from([0, 0, 0]));
            expect(frame[3]).toBe(4);
            expect(frame.readUInt16BE(20)).toBe(CALL_MEDIA_UDP_PORT);
            const response = Buffer.concat([Buffer.from([0, 0, 0, 4]), frame.subarray(4, 22), frame.subarray(22)]);
            relay.send(response, remote.port, remote.address);
        });

        const server = net.createServer((control) => {
            control.on('data', (request: Buffer) => {
                if (request[1] === 1) {
                    expect(request).toEqual(Buffer.from([5, 1, 0]));
                    control.write(Buffer.from([5, 0]));
                } else if (request[1] === 3) {
                    expect(request.subarray(0, 4)).toEqual(Buffer.from([5, 3, 0, 1]));
                    const relayPort = relay.address().port;
                    control.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, relayPort >> 8, relayPort & 255]));
                }
            });
        });
        closers.push(() => server.close());
        const socksPort = await new Promise<number>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
        });

        let resolveReceived: (payload: Buffer) => void = () => undefined;
        const received = new Promise<Buffer>((resolve) => { resolveReceived = resolve; });
        const association = await createSocks5UdpAssociation((payload, address, port) => {
            expect(sameIPv6Address(address, '200::1')).toBe(true);
            expect(port).toBe(CALL_MEDIA_UDP_PORT);
            resolveReceived(payload);
        }, '127.0.0.1', socksPort);
        closers.push(association.close);

        expect(association.send('200::1', CALL_MEDIA_UDP_PORT, Buffer.from('media-frame'))).toBe(true);
        await expect(received).resolves.toEqual(Buffer.from('media-frame'));
        expect(sameIPv6Address('200::1', '200:0:0:0:0:0:0:1')).toBe(true);
        expect(sameIPv6Address('200::1', '201::1')).toBe(false);

    });

    it('rejects invalid destination and port without sending', async () => {
        const relay = dgram.createSocket('udp4');
        closers.push(() => relay.close());
        await new Promise<void>((resolve) => relay.bind(0, '127.0.0.1', resolve));
        const server = net.createServer((control) => {
            control.on('data', (request: Buffer) => {
                if (request[1] === 1) {
                    control.write(Buffer.from([5, 0]));
                } else if (request[1] === 3) {
                    const port = relay.address().port;
                    control.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, port >> 8, port & 255]));
                }
            });
        });
        closers.push(() => server.close());
        const socksPort = await new Promise<number>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
        });
        const association = await createSocks5UdpAssociation(() => undefined, '127.0.0.1', socksPort);
        closers.push(association.close);

        expect(association.send('not-ipv6', CALL_MEDIA_UDP_PORT, Buffer.from([1]))).toBe(false);
        expect(association.send('200::1', 0, Buffer.from([1]))).toBe(false);
    });

    it('rejects a datagram received from another UDP relay', async () => {
        const relay = dgram.createSocket('udp4');
        const rogue = dgram.createSocket('udp4');
        closers.push(() => relay.close(), () => rogue.close());
        await Promise.all([
            new Promise<void>((resolve) => relay.bind(0, '127.0.0.1', resolve)),
            new Promise<void>((resolve) => rogue.bind(0, '127.0.0.1', resolve)),
        ]);
        const server = net.createServer((control) => {
            control.on('data', (request: Buffer) => {
                if (request[1] === 1) control.write(Buffer.from([5, 0]));
                if (request[1] === 3) {
                    const port = relay.address().port;
                    control.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, port >> 8, port & 255]));
                }
            });
        });
        closers.push(() => server.close());
        const socksPort = await new Promise<number>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
        });
        const received = createHash('sha256').update(Buffer.from('signed-media')).digest('hex');
        const metadata = Buffer.from(JSON.stringify({
            type: 'CALL_MEDIA',
            mediaHash: received,
            senderYggAddress: '200::1',
        }));
        const mediaPacket = Buffer.concat([Buffer.from([0x55, 0x43, 0x4d, 0x31]), Buffer.alloc(4), metadata, Buffer.from('signed-media')]);
        mediaPacket.writeUInt32BE(metadata.length, 4);
        const association = await createSocks5UdpAssociation(() => {
            throw new Error('Datagram from untrusted relay was accepted');
        }, '127.0.0.1', socksPort);
        closers.push(association.close);

        const frame = Buffer.alloc(22 + mediaPacket.length);
        frame[3] = 4;
        Buffer.from('02000000000000000000000000000001', 'hex').copy(frame, 4);
        frame.writeUInt16BE(CALL_MEDIA_UDP_PORT, 20);
        mediaPacket.copy(frame, 22);
        rogue.send(frame, relay.address().port, '127.0.0.1');
        await new Promise((resolve) => setTimeout(resolve, 30));
    });
});