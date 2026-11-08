import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callManager } from '../../../src/main_process/network/call/callManager.js';

/**
 * Varios dispositivos de la misma cuenta, punta a punta en el lado del que recibe.
 *
 * La oferta se manda a todas las direcciones conocidas del contacto **con el mismo `callId`**. Eso
 * rompe dos cosas que antes no existían:
 *
 * 1. La oferta repetida llega también al dispositivo que ya está en esa llamada. Tratarla como
 *    «ocupado» mandaba un `CALL_BUSY` al propio llamante y colgaba la llamada que ya estaba en curso.
 * 2. Dos dispositivos de la misma cuenta comparten `upeerId`, así que cualquier comprobación por
 *    usuario confunde «mi otro dispositivo» con «otro contacto».
 */
const { sendMock, sendBusyMock } = vi.hoisted(() => ({ sendMock: vi.fn(), sendBusyMock: vi.fn() }));

vi.mock('../../../src/main_process/security/identity.js', () => ({ getMyUPeerId: () => 'me' }));
vi.mock('../../../src/main_process/security/deviceIdentity.js', () => ({ getDeviceIdentity: () => ({ deviceId: 'dev-1' }) }));

const { contactMock, blockedMock } = vi.hoisted(() => ({
    contactMock: vi.fn(() => ({ address: '200::movil', publicKey: undefined, status: 'connected', knownAddresses: '["200::movil","200::portatil"]' })),
    blockedMock: vi.fn(() => false),
}));
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({ getContactByUpeerId: contactMock, isContactBlocked: blockedMock }));
vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({ getVouchScore: vi.fn(async () => 50) }));
vi.mock('../../../src/main_process/network/server/transport.js', () => ({ sendSecurePacket: sendMock }));
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({ getGroupById: vi.fn(() => undefined) }));
vi.mock('../../../src/main_process/network/call/callSignaling.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main_process/network/call/callSignaling.js')>();
    return { ...actual, sendCallBusy: sendBusyMock, sendCallRing: vi.fn(), sendCallSdp: vi.fn(), sendCallIce: vi.fn() };
});

const PEER = 'b'.repeat(64);

async function handler() {
    return import('../../../src/main_process/network/call/callPacketHandler.js');
}

describe('llamada con varios dispositivos de la misma cuenta', () => {
    beforeEach(() => {
        callManager.resetForTests();
        sendMock.mockClear();
        sendBusyMock.mockClear();
        blockedMock.mockReturnValue(false);
    });

    it('la oferta se manda a todos los dispositivos del contacto', async () => {
        const { sendCallOffer } = await import('../../../src/main_process/network/call/callSignaling.js');

        await sendCallOffer(PEER, 'audio');

        // Sin esto la llamada sonaba en uno solo, elegido por el orden en que se guardaron las
        // direcciones; si era el apagado, no sonaba en ninguno.
        const addresses = sendMock.mock.calls.map((call) => call[0]);
        expect(addresses).toContain('200::movil');
        expect(addresses).toContain('200::portatil');
        expect(new Set(addresses).size).toBe(addresses.length);
    });

    it('la misma oferta repetida no se responde como ocupado', async () => {
        const { handleCallPacket } = await handler();
        // Este dispositivo ya está en esta llamada (la contestó o la está timbrando).
        const session = callManager.create(PEER, 'audio', 'incoming', 'call-1');

        handleCallPacket(PEER, { type: 'CALL_OFFER', callId: session.callId, kind: 'audio', timestamp: Date.now() }, null);

        // Contestar «ocupado» aquí tiraba la llamada del propio usuario que ya estaba en marcha.
        expect(sendBusyMock).not.toHaveBeenCalled();
    });

    it('una llamada distinta con el mismo contacto si es ocupado', async () => {
        const { handleCallPacket } = await handler();
        callManager.create(PEER, 'audio', 'incoming', 'call-1');

        handleCallPacket(PEER, { type: 'CALL_OFFER', callId: 'call-2', kind: 'audio', timestamp: Date.now() }, null);

        expect(sendBusyMock).toHaveBeenCalledTimes(1);
    });

    it('el aceptado lleva el dispositivo que contesta', async () => {
        const { sendCallAccept } = await import('../../../src/main_process/network/call/callSignaling.js');
        callManager.create(PEER, 'audio', 'incoming', 'call-1');

        sendCallAccept(PEER, 'call-1');

        // Sin el dispositivo, el llamante no sabe a dónde mandar la media: dos dispositivos de la
        // misma cuenta comparten upeerId.
        expect(sendMock).toHaveBeenCalledWith(
            '200::movil',
            expect.objectContaining({ type: 'CALL_ACCEPT', callId: 'call-1', deviceId: 'dev-1' }),
            undefined,
        );
    });
});
