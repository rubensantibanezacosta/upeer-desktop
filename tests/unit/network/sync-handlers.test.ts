import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSyncPulse, broadcastPulse } from '../../../src/main_process/network/handlers/sync.js';
import * as messageStatus from '../../../src/main_process/storage/messages/status.js';
import * as messageOps from '../../../src/main_process/storage/messages/operations.js';
import * as dhtShared from '../../../src/main_process/network/dht/shared.js';
import * as transport from '../../../src/main_process/network/server/transport.js';
import * as yggstack from '../../../src/main_process/sidecars/yggstack.js';

type SyncWindow = NonNullable<Parameters<typeof handleSyncPulse>[2]>;
type KademliaInstance = NonNullable<ReturnType<typeof dhtShared.getKademliaInstance>>;

const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as SyncWindow;

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
    getMyDeviceId: vi.fn(() => 'device-1'),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    error: vi.fn(),
}));

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
            expect(messageStatus.updateMessageStatus).not.toHaveBeenCalled();
        });

        it('should ignore pulses from the same device', async () => {
            await handleSyncPulse('my-peer-id', { deviceId: 'device-1' }, mockWin);
            expect(messageStatus.updateMessageStatus).not.toHaveBeenCalled();
        });

        it('should process MESSAGE_READ', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_READ',
                messageId: 'msg-123'
            }, mockWin);

            expect(messageStatus.updateMessageStatus).toHaveBeenCalledWith('msg-123', 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', {
                messageId: 'msg-123',
                status: 'read'
            });
        });

        it('should not send electron event if window is null', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_READ',
                messageId: 'msg-123'
            }, null);
            expect(messageStatus.updateMessageStatus).toHaveBeenCalledWith('msg-123', 'read');
        });

        it('should ignore MESSAGE_READ without messageId', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_READ'
            }, mockWin);
            expect(messageStatus.updateMessageStatus).not.toHaveBeenCalled();
        });

        it('should process MESSAGE_DELETE', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_DELETE',
                messageId: 'msg-456'
            }, mockWin);

            expect(messageOps.deleteMessageLocally).toHaveBeenCalledWith('msg-456');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-deleted', {
                messageId: 'msg-456'
            });
        });

        it('should ignore MESSAGE_DELETE without messageId', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_DELETE'
            }, mockWin);
            expect(messageOps.deleteMessageLocally).not.toHaveBeenCalled();
        });

        it('should process MESSAGE_EDIT', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_EDIT',
                messageId: 'msg-789',
                newContent: 'edited text'
            }, mockWin);

            expect(messageOps.updateMessageContent).toHaveBeenCalledWith('msg-789', 'edited text');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-content-updated', {
                messageId: 'msg-789',
                content: 'edited text'
            });
        });

        it('should ignore MESSAGE_EDIT without messageId or newContent', async () => {
            await handleSyncPulse('my-peer-id', {
                deviceId: 'device-2',
                action: 'MESSAGE_EDIT',
                messageId: 'msg-789'
            }, mockWin);
            expect(messageOps.updateMessageContent).not.toHaveBeenCalled();
        });
    });

    describe('broadcastPulse', () => {
        it('should send pulse to other devices of the same user', async () => {
            vi.mocked(yggstack.getYggstackAddress).mockReturnValue('addr-1');
            const mockKademlia = {
                findClosestContacts: vi.fn().mockReturnValue([
                    { upeerId: 'my-peer-id', address: 'addr-2' },
                    { upeerId: 'my-peer-id', address: 'addr-1' },
                    { upeerId: 'other-user', address: 'addr-3' }
                ])
            } satisfies Pick<KademliaInstance, 'findClosestContacts'>;
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(mockKademlia as KademliaInstance);

            await broadcastPulse('MESSAGE_READ', { messageId: 'm1' });

            expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(1);
            expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('addr-2', expect.objectContaining({
                type: 'SYNC_PULSE',
                action: 'MESSAGE_READ',
                deviceId: 'device-1',
                messageId: 'm1'
            }), undefined, true);
        });

        it('should return if kademlia is not available', async () => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);

            await broadcastPulse('ACTION', {});
            expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        });
    });
});
