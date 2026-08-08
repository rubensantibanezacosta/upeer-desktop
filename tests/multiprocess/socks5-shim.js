import net from 'node:net';

const routing = JSON.parse(process.env.PEER_ROUTING || '{}');

export function parseIPv6ToBuffer(addr) {
    const parts = addr.split(':').filter(Boolean);
    const buf = Buffer.alloc(16);
    for (let i = 0; i < parts.length; i += 1) {
        buf.writeUInt16BE(parseInt(parts[i] || '0', 16) || 0, i * 2);
    }
    return buf;
}

export function encodeFrame(data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, data]);
}

export function socks5Connect(host, _port) {
    return new Promise((resolve, reject) => {
        const port = routing[host];
        if (!port) {
            reject(new Error(`No peer port for ${host}`));
            return;
        }
        const socket = net.connect(port, '127.0.0.1');
        socket.on('connect', () => {
            socket.write(encodeFrame(Buffer.from(process.env.PEER_ID)));
            resolve(socket);
        });
        socket.on('error', reject);
    });
}
