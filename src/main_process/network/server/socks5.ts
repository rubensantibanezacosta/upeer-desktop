import net from 'node:net';
import { SOCKS5_HOST, SOCKS5_PORT } from './constants.js';

export function parseIPv6ToBuffer(addr: string): Buffer {
    addr = addr.replace(/[[\]]/g, '');
    const halves = addr.split('::');
    let groups: string[] = [];

    if (halves.length === 2) {
        const left = halves[0] ? halves[0].split(':') : [];
        const right = halves[1] ? halves[1].split(':') : [];
        const fill = Array(8 - left.length - right.length).fill('0');
        groups = [...left, ...fill, ...right];
    } else {
        groups = addr.split(':');
    }

    const buf = Buffer.alloc(16);
    for (let i = 0; i < 8; i++) {
        const val = parseInt(groups[i] || '0', 16);
        buf.writeUInt16BE(isNaN(val) ? 0 : val, i * 2);
    }
    return buf;
}

export function encodeFrame(data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, data]);
}

export function socks5Connect(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: SOCKS5_HOST, port: SOCKS5_PORT });
        let state: 'greeting' | 'connect' = 'greeting';
        let buf = Buffer.alloc(0);

        socket.setTimeout(8000);
        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('SOCKS5 timeout'));
        });

        socket.on('error', (err) => {
            socket.destroy();
            reject(err);
        });

        socket.once('connect', () => {
            socket.write(Buffer.from([0x05, 0x01, 0x00]));
        });

        socket.on('data', (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);

            if (state === 'greeting') {
                if (buf.length < 2) return;
                if (buf[0] !== 0x05 || buf[1] !== 0x00) {
                    socket.destroy();
                    reject(new Error(`SOCKS5 auth rechazado: ${buf[1]}`));
                    return;
                }
                buf = buf.subarray(2);
                state = 'connect';

                try {
                    const addrBuf = parseIPv6ToBuffer(host);
                    const portBuf = Buffer.alloc(2);
                    portBuf.writeUInt16BE(port, 0);
                    socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x04]), addrBuf, portBuf]));
                } catch (e) {
                    socket.destroy();
                    reject(e);
                }
                return;
            }

            if (state === 'connect') {
                if (buf.length < 10) return;
                socket.removeAllListeners('data');
                socket.setTimeout(0);
                if (buf[1] !== 0x00) {
                    socket.destroy();
                    reject(new Error(`SOCKS5 CONNECT fallido: código ${buf[1]}`));
                    return;
                }
                resolve(socket);
            }
        });
    });
}
