import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callManager } from '../../../src/main_process/network/call/callManager.js';

/**
 * Callar a los demás dispositivos cuando uno contesta.
 *
 * La oferta suena en todos los dispositivos de la cuenta con el **mismo `callId`**. Cuando uno
 * contesta, el llamante cierra su sesión, pero el otro extremo no se enteraba y el portátil se quedaba
 * sonando hasta el tope de 30 s con la llamada ya en marcha en el móvil.
 *
 * Se manda un `CALL_END` con `reason: 'answered-elsewhere'` a todas las direcciones ofrecidas menos a
 * la que contestó. El receptor que lo recibe para el timbre pero **no** escribe una «llamada perdida»:
 * la llamada existe, solo que la cogió el otro dispositivo.
 */
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('../../../src/main_process/security/identity.js', () => ({ getMyUPeerId: () => 'me' }));
vi.mock('../../../src/main_process/security/deviceIdentity.js', () => ({ getDeviceIdentity: () => ({ deviceId: 'dev-1' }) }));

const { contactMock } = vi.hoisted(() => ({
    contactMock: vi.fn(() => ({
        upeerId: 'peer',
        address: '200::movil',
        publicKey: undefined,
        status: 'connected',
        knownAddresses: '["200::movil","200::portatil"]',
    })),
}));
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: contactMock,
    isContactBlocked: () => false,
}));
vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({ getVouchScore: vi.fn(async () => 50) }));
vi.mock('../../../src/main_process/network/server/transport.js', () => ({ sendSecurePacket: sendMock }));
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({ getGroupById: vi.fn(() => undefined) }));

const PEER = 'b'.repeat(64);

describe('callar los demás dispositivos al contestar', () => {
    beforeEach(() => {
        callManager.resetForTests();
        sendMock.mockClear();
    });

    it('la oferta se manda a todos y se recuerda a quiénes', async () => {
        const { sendCallOffer } = await import('../../../src/main_process/network/call/callSignaling.js');
        const callId = await sendCallOffer(PEER, 'audio');

        expect(callManager.get(callId)?.ringTargets).toEqual(['200::movil', '200::portatil']);
    });

    it('al contestar se calla a los demás, no al que contestó', async () => {
        const { sendCallOffer, cancelOtherDevices } = await import('../../../src/main_process/network/call/callSignaling.js');
        const callId = await sendCallOffer(PEER, 'audio');
        const session = callManager.get(callId);
        if (session) session.answeredAddress = '200::movil';
        sendMock.mockClear();

        const sent = cancelOtherDevices(callId);

        expect(sent).toBe(1);
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith(
            '200::portatil',
            expect.objectContaining({ type: 'CALL_END', callId, reason: 'answered-elsewhere' }),
            undefined,
        );
    });

    it('el CALL_ACCEPT con la dirección de origen calla al otro dispositivo', async () => {
        const { sendCallOffer } = await import('../../../src/main_process/network/call/callSignaling.js');
        const { handleCallPacket } = await import('../../../src/main_process/network/call/callPacketHandler.js');
        const callId = await sendCallOffer(PEER, 'audio');
        sendMock.mockClear();

        // El móvil contesta: el paquete llega desde 200::movil.
        handleCallPacket(PEER, { type: 'CALL_ACCEPT', callId, timestamp: Date.now() }, null, '200::movil');

        // El portátil tiene que dejar de sonar.
        expect(sendMock).toHaveBeenCalledWith(
            '200::portatil',
            expect.objectContaining({ type: 'CALL_END', reason: 'answered-elsewhere' }),
            undefined,
        );
        // Y al móvil no se le manda el cese.
        const toMobile = sendMock.mock.calls.filter((call) => call[0] === '200::movil');
        expect(toMobile).toHaveLength(0);
    });

    it('el que contesta no se queda sin llamada por el cese', async () => {
        const { sendCallOffer } = await import('../../../src/main_process/network/call/callSignaling.js');
        const { handleCallPacket } = await import('../../../src/main_process/network/call/callPacketHandler.js');
        const callId = await sendCallOffer(PEER, 'audio');

        handleCallPacket(PEER, { type: 'CALL_ACCEPT', callId, timestamp: Date.now() }, null, '200::movil');

        // La llamada sigue viva: cerrar al llamante sería tirar la que se acaba de coger.
        const session = callManager.get(callId);
        expect(session?.phase).toBe('connected');
    });

    it('recibir answered-elsewhere para el timbre sin marcar la llamada como perdida', async () => {
        const { handleCallPacket } = await import('../../../src/main_process/network/call/callPacketHandler.js');
        const window = { webContents: { send: vi.fn() } };
        const session = callManager.create(PEER, 'audio', 'incoming', 'call-1');
        expect(session.phase).toBe('incoming-ringing');

        handleCallPacket(PEER, { type: 'CALL_END', callId: 'call-1', reason: 'answered-elsewhere', timestamp: Date.now() }, window as never);

        // Deja de sonar…
        expect(callManager.get('call-1')?.phase).toBe('ended');
        // …pero con el motivo correcto, para que no se escriba una fila «Llamada perdida» falsa.
        expect(callManager.get('call-1')?.endReason).toBe('answered-elsewhere');
        expect(window.webContents.send).toHaveBeenCalledWith('call-ended', expect.objectContaining({ reason: 'answered-elsewhere' }));
    });

    it('un CALL_END normal sigue siendo remote-end', async () => {
        const { handleCallPacket } = await import('../../../src/main_process/network/call/callPacketHandler.js');
        const window = { webContents: { send: vi.fn() } };
        callManager.create(PEER, 'audio', 'incoming', 'call-2');

        handleCallPacket(PEER, { type: 'CALL_END', callId: 'call-2', timestamp: Date.now() }, window as never);

        expect(callManager.get('call-2')?.endReason).toBe('remote-end');
    });

    it('una sesión sin direcciones recordadas no manda nada', async () => {
        const { cancelOtherDevices } = await import('../../../src/main_process/network/call/callSignaling.js');
        // Sesión creada por otro camino (o antigua) que no pasó por la oferta.
        callManager.create(PEER, 'audio', 'outgoing', 'call-x');
        sendMock.mockClear();

        expect(cancelOtherDevices('call-x')).toBe(0);
        expect(sendMock).not.toHaveBeenCalled();
    });
});
