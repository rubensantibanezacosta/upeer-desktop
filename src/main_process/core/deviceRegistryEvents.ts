import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(20);

export function onDeviceRegistryChanged(listener: () => void): () => void {
    bus.on('changed', listener);
    return () => {
        bus.off('changed', listener);
    };
}

export function notifyDeviceRegistryChanged(): void {
    bus.emit('changed');
}
