import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

describe('iterativeFindNode edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('resuelve aunque parte del primer lote expire por timeout', async () => {
        const handlers = await import('../../../src/main_process/network/dht/handlers.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
        const targetId = 'aa'.repeat(20);

        vi.mocked(getKademliaInstance).mockReturnValue({
            addContact: vi.fn(),
            findClosestContacts: vi.fn().mockReturnValue([
                { upeerId: '10'.repeat(20), address: 'addr-a', publicKey: 'pk-a' },
                { upeerId: '11'.repeat(20), address: 'addr-b', publicKey: 'pk-b' },
                { upeerId: '12'.repeat(20), address: 'addr-c', publicKey: 'pk-c' },
            ]),
        } as never);

        const mockSendMessage = vi.fn((address: string, data: { type: string; queryId: string }) => {
            if (address === 'addr-a') {
                setTimeout(() => {
                    handlers.handleDhtFoundNodes({
                        queryId: data.queryId,
                        nodes: [{ upeerId: targetId, address: 'target-addr', publicKey: 'target-pk', nodeId: '01'.repeat(20) }],
                    }, address);
                }, 25);
            }

            if (address === 'addr-c') {
                setTimeout(() => {
                    handlers.handleDhtFoundNodes({
                        queryId: data.queryId,
                        nodes: [{ upeerId: '13'.repeat(20), address: 'addr-d', publicKey: 'pk-d', nodeId: '02'.repeat(20) }],
                    }, address);
                }, 40);
            }
        });

        const resultPromise = handlers.iterativeFindNode(targetId, mockSendMessage);

        await vi.advanceTimersByTimeAsync(5_100);
        const result = await resultPromise;

        expect(result).toBe('target-addr');
        expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });

    it('encadena saltos y descarta nodos inválidos o duplicados sin bloquearse', async () => {
        const handlers = await import('../../../src/main_process/network/dht/handlers.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
        const targetId = 'de'.repeat(20);

        vi.mocked(getKademliaInstance).mockReturnValue({
            addContact: vi.fn(),
            findClosestContacts: vi.fn().mockReturnValue([
                { upeerId: '21'.repeat(20), address: 'addr-1', publicKey: 'pk-1' },
                { upeerId: '22'.repeat(20), address: 'addr-2', publicKey: 'pk-2' },
            ]),
        } as never);

        const mockSendMessage = vi.fn((address: string, data: { type: string; queryId: string }) => {
            if (address === 'addr-1') {
                setTimeout(() => {
                    handlers.handleDhtFoundNodes({
                        queryId: data.queryId,
                        nodes: [
                            { upeerId: '22'.repeat(20), address: 'addr-2', publicKey: 'pk-2', nodeId: '03'.repeat(20) },
                            { upeerId: '23'.repeat(20), address: 'addr-3', publicKey: 'pk-3', nodeId: '04'.repeat(20) },
                            { upeerId: '24'.repeat(20), address: '', publicKey: 'pk-broken', nodeId: '05'.repeat(20) },
                        ],
                    }, address);
                }, 20);
            }

            if (address === 'addr-2') {
                setTimeout(() => {
                    handlers.handleDhtFoundNodes({
                        queryId: data.queryId,
                        nodes: [],
                    }, address);
                }, 30);
            }

            if (address === 'addr-3') {
                setTimeout(() => {
                    handlers.handleDhtFoundNodes({
                        queryId: data.queryId,
                        nodes: [{ upeerId: targetId, address: 'target-hop', publicKey: 'pk-target', nodeId: '06'.repeat(20) }],
                    }, address);
                }, 20);
            }
        });

        const resultPromise = handlers.iterativeFindNode(targetId, mockSendMessage);

        await vi.advanceTimersByTimeAsync(5_100);
        await vi.advanceTimersByTimeAsync(5_100);
        const result = await resultPromise;

        expect(result).toBe('target-hop');
        expect(mockSendMessage).toHaveBeenCalledTimes(3);
        expect(mockSendMessage).toHaveBeenNthCalledWith(3, 'addr-3', expect.objectContaining({ type: 'DHT_FIND_NODE' }));
    });
});
