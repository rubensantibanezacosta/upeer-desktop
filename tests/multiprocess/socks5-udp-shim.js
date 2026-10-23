import dgram from 'node:dgram';

const routing = JSON.parse(process.env.PEER_ROUTING || '{}');
const listenPort = Number(process.env.PEER_PORT);

export function sameIPv6Address(first, second) {
    return first === second;
}

export async function createSocks5UdpAssociation(onDatagram) {
    const socket = dgram.createSocket('udp4');
    let closed = false;

    await new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(listenPort, '127.0.0.1', () => {
            socket.removeListener('error', reject);
            resolve();
        });
    });

    socket.on('error', () => {
        closed = true;
    });
    socket.on('message', (frame, remote) => {
        if (frame.length < 3) return;
        const addressLength = frame.readUInt16BE(0);
        if (frame.length < 2 + addressLength) return;
        const address = frame.subarray(2, 2 + addressLength).toString();
        const payload = frame.subarray(2 + addressLength);
        onDatagram(payload, address, remote.port);
    });

    return {
        send: (address, _port, payload, onError) => {
            const target = routing[address];
            if (closed || !target) return false;
            const encodedAddress = Buffer.from(address);
            const header = Buffer.alloc(2);
            header.writeUInt16BE(encodedAddress.length);
            socket.send(Buffer.concat([header, encodedAddress, payload]), target, '127.0.0.1', (cause) => {
                if (cause) onError?.(cause);
            });
            return true;
        },
        isOpen: () => !closed,
        close: () => {
            closed = true;
            socket.close();
        },
    };
}
