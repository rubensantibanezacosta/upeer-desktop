import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMySignedPreKeyBundle: vi.fn(() => ({ spkPub: 'aa'.repeat(32), spkSig: 'bb'.repeat(64), spkId: 1 })),
}));

vi.mock('../../../src/main_process/security/deviceMessaging.js', () => ({
    getDeviceMessagingIdentity: vi.fn(() => ({
        identity: { deviceId: 'cc'.repeat(32) },
        signedPreKey: { spkPub: 'dd'.repeat(32), spkSig: 'ee'.repeat(64), spkId: 2 },
    })),
}));

describe('createDrResetPacket', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('usa la identidad de cuenta por defecto', async () => {
        const { createDrResetPacket } = await import('../../../src/main_process/network/handlers/drResetPacket.js');
        const packet = createDrResetPacket();

        expect(packet.senderDeviceId).toBeUndefined();
        expect(packet.signedPreKey).toEqual({ spkPub: 'aa'.repeat(32), spkSig: 'bb'.repeat(64), spkId: 1 });
    });

    it('usa la SPK y el id del dispositivo cuando la ruta es por dispositivo', async () => {
        const { createDrResetPacket } = await import('../../../src/main_process/network/handlers/drResetPacket.js');
        const packet = createDrResetPacket('direct', { useDeviceIdentity: true });

        expect(packet.senderDeviceId).toBe('cc'.repeat(32));
        expect(packet.signedPreKey).toEqual({ spkPub: 'dd'.repeat(32), spkSig: 'ee'.repeat(64), spkId: 2 });
    });

    it('usa la identidad de dispositivo también en contextos de grupo', async () => {
        const { createDrResetPacket } = await import('../../../src/main_process/network/handlers/drResetPacket.js');
        const packet = createDrResetPacket('group:abc', { useDeviceIdentity: true });

        expect(packet.senderDeviceId).toBe('cc'.repeat(32));
        expect(packet.signedPreKey).toEqual({ spkPub: 'dd'.repeat(32), spkSig: 'ee'.repeat(64), spkId: 2 });
    });
});
