import { describe, expect, it } from 'vitest';
import {
    validateHandshakeReq,
    validateHandshakeAccept,
    validateAck,
    validateRead,
    validateTyping,
    validatePingPong,
    validateChatUpdate,
    validateChatClear,
    validateChatContact,
    validateIdentityUpdate,
    validateDrReset,
} from '../../../src/main_process/security/validationMessaging.js';

const pub64 = 'a'.repeat(64);
const spk = { spkPub: pub64, spkSig: 'b'.repeat(128), spkId: 1 };

describe('validationMessaging (restantes)', () => {
    describe('validateHandshakeReq', () => {
        it('acepta un handshake válido', () => {
            expect(validateHandshakeReq({ publicKey: pub64, signedPreKey: spk }).valid).toBe(true);
        });

        it('rechaza publicKey inválida, alias mal y avatar grande', () => {
            expect(validateHandshakeReq({ publicKey: 'short' }).valid).toBe(false);
            expect(validateHandshakeReq({ publicKey: pub64, alias: 42 }).valid).toBe(false);
            expect(validateHandshakeReq({ publicKey: pub64, alias: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateHandshakeReq({ publicKey: pub64, avatar: 'x'.repeat(400000) }).valid).toBe(false);
        });

        it('valida powProof y signedPreKey cuando están presentes', () => {
            expect(validateHandshakeReq({ publicKey: pub64, powProof: 'not-hex!' }).valid).toBe(false);
            expect(validateHandshakeReq({ publicKey: pub64, signedPreKey: { spkSig: 'short' } }).valid).toBe(false);
            expect(validateHandshakeReq({ publicKey: pub64, signedPreKey: { spkPub: 'short' } }).valid).toBe(false);
        });
    });

    describe('validateHandshakeAccept', () => {
        it('acepta un accept válido', () => {
            expect(validateHandshakeAccept({ publicKey: pub64, signedPreKey: spk }).valid).toBe(true);
        });

        it('rechaza alias y avatar inválidos', () => {
            expect(validateHandshakeAccept({ publicKey: pub64, alias: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateHandshakeAccept({ publicKey: pub64, avatar: 'x'.repeat(400000) }).valid).toBe(false);
            expect(validateHandshakeAccept({ publicKey: 'short' }).valid).toBe(false);
        });
    });

    describe('validateAck / validateRead', () => {
        it('acepta ids válidos', () => {
            expect(validateAck({ id: 'msg-1' }).valid).toBe(true);
            expect(validateRead({ id: 'msg-1' }).valid).toBe(true);
        });

        it('rechaza ids ausentes o demasiado largos', () => {
            expect(validateAck({ id: '' }).valid).toBe(false);
            expect(validateRead({ id: 'a'.repeat(101) }).valid).toBe(false);
        });
    });

    it('validateTyping siempre es válido', () => {
        expect(validateTyping(undefined).valid).toBe(true);
    });

    describe('validatePingPong', () => {
        it('acepta ping vacío y con alias', () => {
            expect(validatePingPong({}).valid).toBe(true);
            expect(validatePingPong({ alias: 'Alice' }).valid).toBe(true);
        });

        it('rechaza ephemeralPublicKey, avatar y alias inválidos', () => {
            expect(validatePingPong({ ephemeralPublicKey: 'short' }).valid).toBe(false);
            expect(validatePingPong({ avatar: 'x'.repeat(400000) }).valid).toBe(false);
            expect(validatePingPong({ alias: 'a'.repeat(101) }).valid).toBe(false);
            expect(validatePingPong({ signedPreKey: { spkId: -1 } }).valid).toBe(false);
        });
    });
});

describe('validationMessaging (update/clear/contact/identity/drReset)', () => {
    describe('validateChatUpdate', () => {
        it('acepta una actualización válida', () => {
            expect(validateChatUpdate({ msgId: 'm1', content: 'a'.repeat(64), nonce: 'b'.repeat(48) }).valid).toBe(true);
        });

        it('rechaza msgId, content y nonce inválidos', () => {
            expect(validateChatUpdate({ content: 'abc' }).valid).toBe(false);
            expect(validateChatUpdate({ msgId: 'm1' }).valid).toBe(false);
            expect(validateChatUpdate({ msgId: 'm1', content: 'a'.repeat(200001) }).valid).toBe(false);
            expect(validateChatUpdate({ msgId: 'm1', content: 'a'.repeat(64), nonce: 'short' }).valid).toBe(false);
        });

        it('exige ciphertext largo cuando hay ratchetHeader/nonce', () => {
            expect(validateChatUpdate({ msgId: 'm1', content: 'short', nonce: 'b'.repeat(48) }).valid).toBe(false);
        });

        it('valida x3dhInit y ratchetHeader', () => {
            const base = { msgId: 'm1', content: 'a'.repeat(64) };
            expect(validateChatUpdate({ ...base, x3dhInit: { ikPub: pub64, ekPub: pub64, spkId: 1 } }).valid).toBe(true);
            expect(validateChatUpdate({ ...base, x3dhInit: { ikPub: 'short' } }).valid).toBe(false);
            expect(validateChatUpdate({ ...base, ratchetHeader: { pn: -1 } }).valid).toBe(false);
        });
    });

    describe('validateChatClear', () => {
        it('acepta un clear válido', () => {
            expect(validateChatClear({ chatUpeerId: 'a'.repeat(64), timestamp: 100, signature: 'b'.repeat(128) }).valid).toBe(true);
            expect(validateChatClear({ chatUpeerId: 'grp-1234', signature: 'b'.repeat(128) }).valid).toBe(true);
        });

        it('rechaza chatUpeerId, timestamp y signature inválidos', () => {
            expect(validateChatClear({ signature: 'b'.repeat(128) }).valid).toBe(false);
            expect(validateChatClear({ chatUpeerId: 'bad', signature: 'b'.repeat(128) }).valid).toBe(false);
            expect(validateChatClear({ chatUpeerId: 'a'.repeat(64), timestamp: -1, signature: 'b'.repeat(128) }).valid).toBe(false);
            expect(validateChatClear({ chatUpeerId: 'a'.repeat(64), signature: 'short' }).valid).toBe(false);
        });
    });

    describe('validateChatContact', () => {
        const base = { id: 'c1', upeerId: 'a'.repeat(64), contactPublicKey: pub64 };

        it('acepta un contacto válido', () => {
            expect(validateChatContact(base).valid).toBe(true);
        });

        it('rechaza campos inválidos', () => {
            expect(validateChatContact({ ...base, id: '' }).valid).toBe(false);
            expect(validateChatContact({ ...base, upeerId: 'short' }).valid).toBe(false);
            expect(validateChatContact({ ...base, contactName: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateChatContact({ ...base, contactPublicKey: 'short' }).valid).toBe(false);
            expect(validateChatContact({ ...base, contactAvatar: 'http://x' }).valid).toBe(false);
            expect(validateChatContact({ ...base, contactAddress: 42 }).valid).toBe(false);
        });
    });

    describe('validateIdentityUpdate', () => {
        it('acepta actualización vacía o válida', () => {
            expect(validateIdentityUpdate({}).valid).toBe(true);
            expect(validateIdentityUpdate({ alias: 'Alice' }).valid).toBe(true);
        });

        it('rechaza alias y avatar inválidos', () => {
            expect(validateIdentityUpdate({ alias: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateIdentityUpdate({ avatar: 'http://x' }).valid).toBe(false);
            expect(validateIdentityUpdate({ avatar: 'data:image/png;base64,'.padEnd(3000000, 'a') }).valid).toBe(false);
        });
    });

    describe('validateDrReset', () => {
        it('acepta ausencia y signedPreKey válida', () => {
            expect(validateDrReset({}).valid).toBe(true);
            expect(validateDrReset({ signedPreKey: spk }).valid).toBe(true);
        });

        it('rechaza signedPreKey inválida', () => {
            expect(validateDrReset({ signedPreKey: { spkId: -1 } }).valid).toBe(false);
        });
    });
});
