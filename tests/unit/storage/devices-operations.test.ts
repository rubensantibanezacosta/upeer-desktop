import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertDevice, getDevicesByUPeerId, setDeviceTrust, deleteDevice } from '../../../src/main_process/storage/devices-operations.js';

// Mocks para drizzle/sqlite
const mockDb = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    onConflictDoUpdate: vi.fn(() => mockDb),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
}));

vi.mock('../../../src/main_process/storage/schema.js', () => ({
    devices: {
        upeerId: 'upeer_id',
        deviceId: 'device_id',
    }
}));

describe('Devices Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('upsertDevice calls insert with onConflictDoUpdate', async () => {
        const meta = { clientName: 'Test', platform: 'linux', clientVersion: '1.0' };
        await upsertDevice('peer-1', 'dev-1', meta);

        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
            upeerId: 'peer-1',
            deviceId: 'dev-1',
            clientName: 'Test'
        }));
        expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('getDevicesByUPeerId calls select', async () => {
        await getDevicesByUPeerId('peer-1');
        expect(mockDb.select).toHaveBeenCalled();
        expect(mockDb.from).toHaveBeenCalled();
        expect(mockDb.where).toHaveBeenCalled();
    });

    it('setDeviceTrust calls update', async () => {
        await setDeviceTrust('peer-1', 'dev-1', true);
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ isTrusted: true });
    });

    it('deleteDevice calls delete', async () => {
        await deleteDevice('peer-1', 'dev-1');
        expect(mockDb.delete).toHaveBeenCalled();
        expect(mockDb.where).toHaveBeenCalled();
    });
});
