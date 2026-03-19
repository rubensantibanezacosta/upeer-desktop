import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSyncPulse, broadcastPulse } from '../../../src/main_process/network/handlers/sync.js';

// Mock de Electron
const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as any;

// Mocks de dependencias
vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
    getMyDeviceId: vi.fn(() => 'device-1'),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    error: vi.fn(),
}));

// Mock dinámicos de los módulos importados en caliente
vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    updateMessageStatus: vi.fn(),
}));
vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    updateMessageContent: vi.fn(),
    deleteMessageLocally: vi.fn(),
}));
vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));
vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));
vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(),
}));

describe('Sync Handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleSyncPulse', () => {
        it('should ignore pulses from different users', async () => {
            await handleSyncPulse('other-user', { deviceId: 'device-2' }, mockWin);
            // No debería llamar a nada de storage
            const { updateMessageStatus } = await import('../../../src/main_process/storage/messages/status.js');
            expect(updateMessageStatus).not.toHaveBeenCalled();
        });

        it('should ignore pulses from the same device', async () => {
            await handleSyncPulse('my-peer-id', { deviceId: 'device-1' }, mockWin);
            const { updateMessageStatus } = await import('../../../src/main_process/storage/messages/status.js');
            expect(updateMessageStatus).not.toHaveBeenCalled();
        });

        it('should process MESSAGE_READ', async () => {
            const { updateMessageStatus } = await import('../../../src/main_process/storage/messages/status.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_READ',
                messageId: 'msg-123'
            }, mockWin);

            expect(updateMessageStatus).toHaveBeenCalledWith('msg-123', 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', {
                messageId: 'msg-123',
                status: 'read'
            });
        });

        it('should not send electron event if window is null', async () => {
            const { updateMessageStatus } = await import('../../../src/main_process/storage/messages/status.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_READ',
                messageId: 'msg-123'
            }, null);
            expect(updateMessageStatus).toHaveBeenCalledWith('msg-123', 'read');
        });

        it('should ignore MESSAGE_READ without messageId', async () => {
            const { updateMessageStatus } = await import('../../../src/main_process/storage/messages/status.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_READ'
            }, mockWin);
            expect(updateMessageStatus).not.toHaveBeenCalled();
        });

        it('should process MESSAGE_DELETE', async () => {
            const { deleteMessageLocally } = await import('../../../src/main_process/storage/messages/operations.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_DELETE',
                messageId: 'msg-456'
            }, mockWin);

            expect(deleteMessageLocally).toHaveBeenCalledWith('msg-456');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-deleted', {
                messageId: 'msg-456'
            });
        });

        it('should ignore MESSAGE_DELETE without messageId', async () => {
            const { deleteMessageLocally } = await import('../../../src/main_process/storage/messages/operations.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_DELETE'
            }, mockWin);
            expect(deleteMessageLocally).not.toHaveBeenCalled();
        });

        it('should process MESSAGE_EDIT', async () => {
            const { updateMessageContent } = await import('../../../src/main_process/storage/messages/operations.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_EDIT',
                messageId: 'msg-789',
                newContent: 'edited text'
            }, mockWin);

            expect(updateMessageContent).toHaveBeenCalledWith('msg-789', 'edited text');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-content-updated', {
                messageId: 'msg-789',
                content: 'edited text'
            });
        });

        it('should ignore MESSAGE_EDIT without messageId or newContent', async () => {
            const { updateMessageContent } = await import('../../../src/main_process/storage/messages/operations.js');
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_EDIT',
                messageId: 'msg-789'
            }, mockWin);
            expect(updateMessageContent).not.toHaveBeenCalled();
        });
    });

    describe('broadcastPulse', () => {
        it('should send pulse to other devices of the same user', async () => {
            const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
            const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
            const { getYggstackAddress } = await import('../../../src/main_process/sidecars/yggstack.js');

            (getYggstackAddress as any).mockReturnValue('addr-1');
            const mockKademlia = {
                findClosestContacts: vi.fn().mockReturnValue([
                    { upeerId: 'my-peer-id', address: 'addr-2' }, // Twin device
                    { upeerId: 'my-peer-id', address: 'addr-1' }, // My own address (should be skipped)
                    { upeerId: 'other-user', address: 'addr-3' }  // Different user (should be skipped)
                ])
            };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            await broadcastPulse('MESSAGE_READ', { messageId: 'm1' });

            expect(sendSecureUDPMessage).toHaveBeenCalledTimes(1);
            expect(sendSecureUDPMessage).toHaveBeenCalledWith('addr-2', expect.objectContaining({
                type: 'SYNC_PULSE',
                action: 'MESSAGE_READ',
                deviceId: 'device-1',
                messageId: 'm1'
            }), undefined, true);
        });

        it('should return if kademlia is not available', async () => {
            const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
            const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
            (getKademliaInstance as any).mockReturnValue(null);

            await broadcastPulse('ACTION', {});
            expect(sendSecureUDPMessage).not.toHaveBeenCalled();
        });
    });
});
