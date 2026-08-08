import { describe, expect, it, beforeEach } from 'vitest';

describe('network/server/state.ts', () => {
    let mod: typeof import('../../../src/main_process/network/server/state.js');

    beforeEach(async () => {
        mod = await import('../../../src/main_process/network/server/state.js');
    });

    it('gestiona mainWindow', () => {
        const win = {} as never;
        mod.setMainWindow(win);
        expect(mod.getMainWindow()).toBe(win);
        mod.setMainWindow(null);
        expect(mod.getMainWindow()).toBeNull();
    });

    it('gestiona tcpServer', () => {
        const server = {} as never;
        mod.setTcpServer(server);
        expect(mod.getTcpServer()).toBe(server);
        mod.setTcpServer(null);
        expect(mod.getTcpServer()).toBeNull();
    });

    it('gestiona kademliaDHT', () => {
        const dht = {} as never;
        mod.setKademliaDHT(dht);
        expect(mod.getKademliaDHT()).toBe(dht);
        mod.setKademliaDHT(null);
        expect(mod.getKademliaDHT()).toBeNull();
    });

    it('gestiona dhtMaintenanceTimer', () => {
        const timer = {} as ReturnType<typeof setInterval>;
        mod.setDhtMaintenanceTimer(timer);
        expect(mod.getDhtMaintenanceTimer()).toBe(timer);
        mod.setDhtMaintenanceTimer(null);
        expect(mod.getDhtMaintenanceTimer()).toBeNull();
    });

    it('gestiona networkReady', () => {
        expect(mod.getNetworkReady()).toBe(false);
        mod.setNetworkReady(true);
        expect(mod.getNetworkReady()).toBe(true);
        mod.setNetworkReady(false);
    });

    it('añade, drena y limpia la cola de envío', () => {
        mod.addToSendQueue({ ip: '200::1', framedBuf: Buffer.from([1]) });
        mod.addToSendQueue({ ip: '200::2', framedBuf: Buffer.from([2]) });
        expect(mod.getSendQueue()).toHaveLength(2);

        const drained = mod.drainSendQueue();
        expect(drained).toHaveLength(2);
        expect(mod.getSendQueue()).toHaveLength(0);

        mod.addToSendQueue({ ip: '200::3', framedBuf: Buffer.from([3]) });
        mod.clearSendQueue();
        expect(mod.getSendQueue()).toHaveLength(0);
    });
});
