import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleHandshakeReq, handleHandshakeAccept } from '../../../src/main_process/network/handlers/contacts.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as pow from '../../../src/main_process/security/pow.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';

// Mock de dependencias
vi.mock('../../../src/main_process/storage/db.js', () => ({
    getContactByUpeerId: vi.fn(),
    addOrUpdateContact: vi.fn(),
    isContactBlocked: vi.fn(() => false),
    updateContactPublicKey: vi.fn(),
    updateContactEphemeralPublicKey: vi.fn(),
    getContactByAddress: vi.fn(),
    updateContactName: vi.fn(),
    updateContactAvatar: vi.fn(),
    deleteContact: vi.fn(),
    getContacts: vi.fn(() => []), // Añadido para evitar error de import dinámico
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    runTransaction: vi.fn((fn) => fn()),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    verify: vi.fn(() => true),
    getUPeerIdFromPublicKey: vi.fn((pk) => `peer-${pk.toString('hex').slice(0, 8)}`),
}));

vi.mock('../../../src/main_process/security/pow.js', () => ({
    AdaptivePow: {
        verifyLightProof: vi.fn(() => true)
    }
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn(async () => { }),
    computeScore: vi.fn(() => 100),
    VouchType: { HANDSHAKE: 'HANDSHAKE' }
}));

vi.mock('../../../src/main_process/storage/contacts/keys.js', () => ({
    computeKeyFingerprint: vi.fn((pk) => `fingerprint-${pk.slice(0, 8)}`),
    updateContactSignedPreKey: vi.fn(),
}));

// Mock de Electron
const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as any;

describe('Contact Handlers', () => {
    const rinfo = { address: '1.2.3.4', port: 12345 };
    const senderUpeerId = 'peer-pubkey12';
    const senderYggAddress = 'ygg-addr';
    const mockSendResponse = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleHandshakeReq', () => {
        it('should accept handshake from a new contact with valid PoW', async () => {
            const data = {
                publicKey: 'pubkey1234567890abcdef1234567890abcdef1234567890abcdef12345678',
                powProof: 'valid-proof',
                alias: 'Alice'
            };

            (db.getContactByUpeerId as any).mockResolvedValue(null); // Nuevo contacto
            (identity.getUPeerIdFromPublicKey as any).mockReturnValue(senderUpeerId);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(pow.AdaptivePow.verifyLightProof).toHaveBeenCalledWith('valid-proof', senderUpeerId);
            expect(db.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId,
                rinfo.address,
                'Alice',
                data.publicKey,
                'incoming',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            );

            expect(mockWin.webContents.send).toHaveBeenCalledWith('contact-request-received', expect.objectContaining({
                upeerId: senderUpeerId,
                alias: 'Alice'
            }));
        });

        it('should reject new contact without PoW', async () => {
            const data = {
                publicKey: 'pubkey',
                alias: 'NoPOW'
            };

            (db.getContactByUpeerId as any).mockResolvedValue(null);
            (identity.getUPeerIdFromPublicKey as any).mockReturnValue(senderUpeerId);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(db.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should handle re-handshake from already connected contact', async () => {
            const data = {
                publicKey: 'existing-pubkey',
                alias: 'Alice (updated)'
            };

            (db.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'connected',
                publicKey: 'existing-pubkey'
            });
            (identity.getUPeerIdFromPublicKey as any).mockReturnValue(senderUpeerId);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            // No debería pedir PoW si ya existe y está conectado
            expect(pow.AdaptivePow.verifyLightProof).not.toHaveBeenCalled();
            // Debería actualizar estado como conectado
            expect(db.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId,
                rinfo.address,
                expect.any(String),
                data.publicKey,
                'connected',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            );
        });

        it('should block handshake if contact is blocked', async () => {
            const data = { publicKey: 'pubkey' };
            (db.isContactBlocked as any).mockReturnValue(true);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(db.addOrUpdateContact).not.toHaveBeenCalled();
        });
    });

    describe('handleHandshakeAccept', () => {
        it('should upgrade pending contact to connected', async () => {
            const data = {
                publicKey: 'new-pubkey',
                alias: 'Bob'
            };

            (db.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending',
                name: 'Bob Pending'
            });
            (identity.getUPeerIdFromPublicKey as any).mockReturnValue(senderUpeerId);
            (db.updateContactPublicKey as any).mockReturnValue({ changed: false }); // Mock del retorno esperado

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(db.updateContactPublicKey).toHaveBeenCalled();
            expect(db.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId,
                rinfo.address,
                'Bob',
                data.publicKey,
                'connected',
                undefined,
                undefined,
                undefined,
                undefined,
                expect.any(Array)
            );
        });
    });
});
