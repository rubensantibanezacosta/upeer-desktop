/* eslint-disable no-console */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactStatuses: Record<string, { status: string; publicKey: string; address: string }> = {};

const { sendMock, scoreMock } = vi.hoisted(() => ({ sendMock: vi.fn(), scoreMock: vi.fn() }));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => 'me',
    getMyPublicKeyHex: () => '11'.repeat(32),
    getMyPublicKey: () => Buffer.from('11'.repeat(32), 'hex'),
    sign: () => Buffer.from('sig'),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: (upeerId: string) => contactStatuses[upeerId] ?? null,
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({ getVouchScore: scoreMock }));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({ sendSecureUDPMessage: sendMock }));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
}));

/**
 * Benchmark de escalabilidad de llamadas (voz/vídeo). Mide el número de
 * paquetes de media que envía cada participante al subir N, comparando el
 * fan-out mesh (sin relay) frente al enrutamiento con relay distribuido.
 */
describe('escalabilidad de llamadas (voz/vídeo)', () => {
    const SIZES = [2, 5, 10, 50, 100];

    let callManager: typeof import('../../../src/main_process/network/call/callManager.js')['callManager'];
    let signaling: typeof import('../../../src/main_process/network/call/callSignaling.js');

    beforeEach(async () => {
        callManager = (await import('../../../src/main_process/network/call/callManager.js')).callManager;
        signaling = await import('../../../src/main_process/network/call/callSignaling.js');
        callManager.resetForTests();
        sendMock.mockClear();
        scoreMock.mockReset();
        scoreMock.mockResolvedValue(50);
        Object.keys(contactStatuses).forEach((key) => delete contactStatuses[key]);
        contactStatuses.me = { status: 'connected', publicKey: 'aa'.repeat(32), address: '200::me' };
    });

    it('media mesh: cada emisor envía a N-1 participantes (subida O(N) por emisor)', () => {
        for (const N of SIZES) {
            const members = Array.from({ length: N - 1 }, (_, i) => `p${i}`);
            members.forEach((m, i) => {
                contactStatuses[m] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::p${i}` };
            });
            const session = callManager.createGroup(members, 'audio');
            sendMock.mockClear();
            signaling.sendCallMedia(members[0], session.callId, 'frame');
            const sent = sendMock.mock.calls.length;
            expect(sent).toBe(N - 1);
            console.log(`  mesh N=${N}: ${sent} envíos por emisor`);
        }
    });

    it('media con relay: un emisor no-relay envía 1 paquete al relay (subida O(1))', async () => {
        for (const N of SIZES) {
            if (N < 3) {
                continue;
            }
            const members = Array.from({ length: N - 1 }, (_, i) => `p${i}`);
            members.forEach((m, i) => {
                contactStatuses[m] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::p${i}` };
            });
            const session = callManager.createGroup(members, 'audio');
            const relay = members[1];
            callManager.setRelayUpeer(session.callId, relay);
            sendMock.mockClear();
            signaling.sendCallMedia(members[0], session.callId, 'frame');
            const sent = sendMock.mock.calls.length;
            expect(sent).toBe(1);
            expect(sendMock).toHaveBeenCalledWith(`200::p1`, expect.objectContaining({ type: 'CALL_MEDIA' }), expect.anything());
            console.log(`  relay N=${N}: ${sent} envío por emisor (al relay)`);
        }
    });

    it('recomputeRelay: mesh por debajo del umbral, relay por encima (decisión automática)', async () => {
        for (const N of SIZES) {
            const members = Array.from({ length: N - 1 }, (_, i) => `p${i}`);
            members.forEach((m, i) => {
                contactStatuses[m] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::p${i}` };
            });
            const highMember = members[members.length - 1];
            scoreMock.mockImplementation(async (id) => (id === highMember ? 90 : 50));
            const session = callManager.createGroup(members, 'audio');
            session.peerUpeerId = members[0];
            const relay = await signaling.recomputeRelay(session.callId);
            const participantCount = new Set([...members, members[0], 'me']).size;
            console.log(`  decisión N=${participantCount} participantes: ${relay ? 'relay=' + relay : 'mesh'}`);
            if (participantCount <= 4) {
                expect(relay).toBeUndefined();
                expect(callManager.getRelayUpeer(session.callId)).toBeUndefined();
            } else {
                expect(relay).toBe(highMember);
                expect(callManager.getRelayUpeer(session.callId)).toBe(highMember);
            }
        }
    });
});
