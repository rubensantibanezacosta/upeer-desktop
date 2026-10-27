import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import { verifyHandshakeSignature } from '../../../src/main_process/network/handlers/contactsShared.js';
import { AdaptivePow } from '../../../src/main_process/security/pow.js';

type LinkedPacket = {
    packet: Record<string, unknown>;
    signature: string;
};

type LinkedVector = {
    generatedBy: string;
    now: number;
    senderYggAddress: string;
    accountPublicKey: string;
    accountUpeerId: string;
    devicePublicKey: string;
    deviceId: string;
    request: LinkedPacket;
    accept: LinkedPacket;
};

const vector = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/device-handshake-linked-go.json'), 'utf8'),
) as LinkedVector;

function handshakeData(packet: Record<string, unknown>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(packet)) {
        if (key === 'signature' || key === 'senderUpeerId' || key === 'senderYggAddress') continue;
        data[key] = packet[key];
    }
    return data;
}

describe('vector Go de handshake firmado por dispositivo', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('declara el generador esperado', () => {
        expect(vector.generatedBy).toBe('upper-transport-bridge');
    });

    it('acepta el HANDSHAKE_REQ que genera el puente', () => {
        vi.useFakeTimers({ now: new Date(vector.now + 60_000) });
        const data = handshakeData(vector.request.packet);

        expect(verifyHandshakeSignature(data as never, vector.request.signature, vector.accountUpeerId, vector.senderYggAddress, 'request')).toBe(true);
    });

    it('acepta el HANDSHAKE_ACCEPT que genera el puente', () => {
        vi.useFakeTimers({ now: new Date(vector.now + 60_000) });
        const data = handshakeData(vector.accept.packet);

        expect(verifyHandshakeSignature(data as never, vector.accept.signature, vector.accountUpeerId, vector.senderYggAddress, 'accept')).toBe(true);
    });

    it('el PoW del vector sirve para un contacto nuevo', () => {
        vi.useFakeTimers({ now: new Date(vector.now) });
        const proof = vector.request.packet.powProof;
        expect(typeof proof).toBe('string');
        expect(AdaptivePow.verifyLightProof(proof as string, vector.accountUpeerId)).toBe(true);
    });

    it('no manda PoW en el HANDSHAKE_ACCEPT', () => {
        expect(vector.accept.packet.powProof).toBeUndefined();
    });

    it('rechaza el vector si se cambia el alias', () => {
        vi.useFakeTimers({ now: new Date(vector.now + 60_000) });
        const data = { ...handshakeData(vector.request.packet), alias: 'suplantado' };

        expect(verifyHandshakeSignature(data as never, vector.request.signature, vector.accountUpeerId, vector.senderYggAddress, 'request')).toBe(false);
    });

    it('rechaza el vector cuando el certificado ya expiró', () => {
        vi.useFakeTimers({ now: new Date(vector.now + 400 * 24 * 60 * 60 * 1000) });
        const data = handshakeData(vector.request.packet);

        expect(verifyHandshakeSignature(data as never, vector.request.signature, vector.accountUpeerId, vector.senderYggAddress, 'request')).toBe(false);
    });

    it('rechaza el vector si se presenta como otra cuenta', () => {
        vi.useFakeTimers({ now: new Date(vector.now + 60_000) });
        const data = handshakeData(vector.request.packet);
        const otherAccount = 'f'.repeat(64);

        expect(verifyHandshakeSignature(data as never, vector.request.signature, otherAccount, vector.senderYggAddress, 'request')).toBe(false);
    });
});
