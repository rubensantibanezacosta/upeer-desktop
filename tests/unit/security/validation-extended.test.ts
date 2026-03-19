import { describe, it, expect } from 'vitest';
import {
    validateHandshakeReq,
    validateHandshakeAccept,
    validateChat,
    validatePingPong,
    validateChatReaction,
    validateChatDelete,
    validateDhtResponse,
    validateDhtExchange,
    validateDhtStore,
    validateVaultAck,
    validateVaultDelivery,
    validateVaultRenew,
    validateFileChunk,
    validateGroupMsg,
    validateGroupAck,
    validateGroupInvite,
    validateGroupUpdate,
    validateGroupLeave,
    validateReputationGossip,
    validateReputationRequest,
    validateReputationDeliver,
    validateMessage
} from '../../../src/main_process/security/validation.js';

describe('Security Validation - Comprehensive Tests', () => {

    describe('validateHandshakeReq Extended', () => {
        it('should fail with too long alias', () => {
            const data = {
                publicKey: 'a'.repeat(64),
                alias: 'a'.repeat(101)
            };
            const result = validateHandshakeReq(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Alias too long');
        });

        it('should validate avatar size limit (BUG AD fix)', () => {
            const validAvatar = 'a'.repeat(307200);
            const invalidAvatar = 'a'.repeat(307201);

            expect(validateHandshakeReq({ publicKey: 'a'.repeat(64), avatar: validAvatar }).valid).toBe(true);
            const result = validateHandshakeReq({ publicKey: 'a'.repeat(64), avatar: invalidAvatar });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Avatar too large or invalid');
        });

        it('should validate powProof formats (BUG DL fix)', () => {
            const validHex = 'abcdef0123456789'.repeat(4); // 64 chars
            const validJson = JSON.stringify({ s: 'hex-salt', t: Date.now() });

            expect(validateHandshakeReq({ publicKey: 'a'.repeat(64), powProof: validHex }).valid).toBe(true);
            expect(validateHandshakeReq({ publicKey: 'a'.repeat(64), powProof: validJson }).valid).toBe(true);

            const result = validateHandshakeReq({ publicKey: 'a'.repeat(64), powProof: 'invalid-format!' });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid powProof format');
        });

        it('should validate signedPreKey structure (BUG DC fix)', () => {
            const base = { publicKey: 'a'.repeat(64) };

            // Valid case
            expect(validateHandshakeReq({
                ...base,
                signedPreKey: { spkPub: 'a'.repeat(64), spkSig: 'b'.repeat(128), spkId: 1 }
            }).valid).toBe(true);

            // Invalid types/lengths
            expect(validateHandshakeReq({ ...base, signedPreKey: 'not-an-object' }).valid).toBe(false);
            expect(validateHandshakeReq({ ...base, signedPreKey: { spkPub: 'short' } }).valid).toBe(false);
            expect(validateHandshakeReq({ ...base, signedPreKey: { spkSig: 'short' } }).valid).toBe(false);
            expect(validateHandshakeReq({ ...base, signedPreKey: { spkId: -1 } }).valid).toBe(false);
        });
    });

    describe('validateHandshakeAccept Extended', () => {
        it('should validate alias limit in HANDSHAKE_ACCEPT (BUG DB fix)', () => {
            const base = { publicKey: 'a'.repeat(64) };
            expect(validateHandshakeAccept({ ...base, alias: 'a'.repeat(100) }).valid).toBe(true);

            const result = validateHandshakeAccept({ ...base, alias: 'a'.repeat(101) });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Alias too long or invalid in HANDSHAKE_ACCEPT');
        });
    });

    describe('validateChat Extended', () => {
        const base = { id: 'msg1', content: 'hexcontent' };

        it('should fail with extremely long content (BUG U3 fix)', () => {
            const wayTooLong = 'a'.repeat(200_001);
            const result = validateChat({ ...base, content: wayTooLong });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Content too long');
        });

        it('should enforce minimum ciphertext length if encrypted (BUG DK fix)', () => {
            // content 'abc' is too short for an encrypted message (nonce/ratchetHeader present)
            const result = validateChat({ ...base, content: 'abc', nonce: 'a'.repeat(48) });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Ciphertext too short (min 32 hex chars)');
        });

        it('should validate x3dhInit fields (BUG CO fix)', () => {
            const x3dhValid = { ikPub: 'a'.repeat(64), ekPub: 'b'.repeat(64), spkId: 10 };
            expect(validateChat({ ...base, x3dhInit: x3dhValid }).valid).toBe(true);

            expect(validateChat({ ...base, x3dhInit: { ikPub: 'short' } }).valid).toBe(false);
            expect(validateChat({ ...base, x3dhInit: { ekPub: 'short' } }).valid).toBe(false);
            expect(validateChat({ ...base, x3dhInit: { spkId: 'not-a-number' } }).valid).toBe(false);
        });

        it('should validate ratchetHeader fields', () => {
            const rhValid = { dh: 'a'.repeat(64), pn: 5, n: 10 };
            // Content must be at least 32 chars if ratchetHeader is present (BUG DK fix)
            const chatData = { ...base, content: 'a'.repeat(32), ratchetHeader: rhValid };
            expect(validateChat(chatData).valid).toBe(true);

            expect(validateChat({ ...base, ratchetHeader: { dh: 'short' } }).valid).toBe(false);
            expect(validateChat({ ...base, ratchetHeader: { pn: -1 } }).valid).toBe(false);
        });
    });

    describe('validateMiscHandlers', () => {
        it('should validate validatePingPong (BUG CQ fix)', () => {
            expect(validatePingPong({ ephemeralPublicKey: 'a'.repeat(64) }).valid).toBe(true);
            expect(validatePingPong({ ephemeralPublicKey: 'short' }).valid).toBe(false);
            expect(validatePingPong({ avatar: 'a'.repeat(307201) }).valid).toBe(false);
            expect(validatePingPong({ alias: 'a'.repeat(101) }).valid).toBe(false);
        });

        it('should validate validateChatReaction', () => {
            const valid = { msgId: 'id', emoji: '😊', remove: false };
            expect(validateChatReaction(valid).valid).toBe(true);
            expect(validateChatReaction({ ...valid, msgId: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateChatReaction({ ...valid, emoji: 'a'.repeat(11) }).valid).toBe(false);
            expect(validateChatReaction({ ...valid, remove: 'not-bool' }).valid).toBe(false);
        });

        it('should validate validateChatDelete (BUG DD fix)', () => {
            expect(validateChatDelete({ msgId: 'id', signature: 'a'.repeat(128) }).valid).toBe(true);
            expect(validateChatDelete({ msgId: 'id', signature: 'short' }).valid).toBe(false);
        });

        it('should validate validateDhtResponse', () => {
            const valid = { targetId: 'a'.repeat(32) };
            expect(validateDhtResponse(valid).valid).toBe(true);
            expect(validateDhtResponse({ ...valid, neighbors: 'not-an-array' }).valid).toBe(false);

            const lb = { address: 'addr', dhtSeq: 1, signature: 'a'.repeat(128) };
            expect(validateDhtResponse({ ...valid, locationBlock: lb }).valid).toBe(true);
            expect(validateDhtResponse({ ...valid, locationBlock: { ...lb, dhtSeq: -1 } }).valid).toBe(false);
        });
    });

    describe('DHT & Vault Operations (Uncovered Branches)', () => {
        it('should validate validateDhtExchange', () => {
            const valid = { peers: [{ upeerId: 'a'.repeat(32), publicKey: 'b'.repeat(64), locationBlock: { address: '200::1', dhtSeq: 1, signature: 'c'.repeat(128) } }] };
            expect(validateDhtExchange(valid).valid).toBe(true);
            expect(validateDhtExchange({ peers: 'not-an-array' }).valid).toBe(false);
            expect(validateDhtExchange({ peers: new Array(51) }).valid).toBe(false);
            expect(validateDhtExchange({ peers: [{ upeerId: 'short' }] }).valid).toBe(false);
        });

        it('should validate validateDhtStore with error handling', () => {
            const valid = { key: 'a'.repeat(40), value: { data: 'val' } };
            expect(validateDhtStore(valid).valid).toBe(true);

            // Error path (try-catch) - JSON stringify failure (circular reference)
            const circular: any = {};
            circular.self = circular;
            expect(validateDhtStore({ ...valid, value: circular }).valid).toBe(false);

            expect(validateDhtStore({ ...valid, key: 'short' }).valid).toBe(false);
            expect(validateDhtStore({ ...valid, value: 'a'.repeat(10001) }).valid).toBe(false);
        });

        it('should validate validateVaultAck', () => {
            const valid = { payloadHashes: ['a'.repeat(64)] };
            expect(validateVaultAck(valid).valid).toBe(true);
            expect(validateVaultAck({ payloadHashes: 'not-array' }).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: new Array(201) }).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: ['a'.repeat(201)] }).valid).toBe(false);
        });

        it('should validate validateVaultDelivery branches', () => {
            const entry = { senderSid: 'a', payloadHash: 'b', data: 'hex' };
            const valid = { entries: [entry] };
            expect(validateVaultDelivery(valid).valid).toBe(true);
            expect(validateVaultDelivery({ entries: 'not-array' }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: new Array(101) }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ ...entry, senderSid: 'a'.repeat(129) }] }).valid).toBe(false);
        });

        it('should validate validateVaultRenew', () => {
            const valid = { payloadHash: 'a'.repeat(64), newExpiresAt: 12345 };
            expect(validateVaultRenew(valid).valid).toBe(true);
            expect(validateVaultRenew({ payloadHash: 'short' }).valid).toBe(false);
            expect(validateVaultRenew({ ...valid, newExpiresAt: -1 }).valid).toBe(false);
        });
    });

    describe('Edge Cases & Missing Branches', () => {
        it('should validate signedPreKey branches in validateHandshakeReq', () => {
            const base = { publicKey: 'a'.repeat(64) };
            // spkId is integer
            expect(validateHandshakeReq({ ...base, signedPreKey: { spkId: 1.5 } }).valid).toBe(false);
            // spkId can be 0 or positive
            expect(validateHandshakeReq({ ...base, signedPreKey: { spkId: 0 } }).valid).toBe(true);
            // spkPub is optional in the object
            expect(validateHandshakeReq({ ...base, signedPreKey: { spkId: 1 } }).valid).toBe(true);
        });

        it('should validate signedPreKey branches in validateHandshakeAccept', () => {
            const base = { publicKey: 'a'.repeat(64) };
            expect(validateHandshakeAccept({ ...base, signedPreKey: { spkId: 1.5 } }).valid).toBe(false);
            expect(validateHandshakeAccept({ ...base, signedPreKey: { spkId: 0 } }).valid).toBe(true);
        });

        it('should validate x3dhInit and ratchetHeader edge cases in validateChat', () => {
            const base = { id: 'm1', content: 'a'.repeat(32) };
            // x3dhInit null/not object
            expect(validateChat({ ...base, x3dhInit: 123 }).valid).toBe(false);
            // spkId not integer
            expect(validateChat({ ...base, x3dhInit: { ikPub: 'a'.repeat(64), ekPub: 'b'.repeat(64), spkId: 1.1 } }).valid).toBe(false);
            // spkId negative
            expect(validateChat({ ...base, x3dhInit: { ikPub: 'a'.repeat(64), ekPub: 'b'.repeat(64), spkId: -1 } }).valid).toBe(false);

            // ratchetHeader null/not object
            expect(validateChat({ ...base, ratchetHeader: 'no' }).valid).toBe(false);
            // pn/n too large
            expect(validateChat({ ...base, ratchetHeader: { pn: 1_000_001 } }).valid).toBe(false);
            expect(validateChat({ ...base, ratchetHeader: { n: 1_000_001 } }).valid).toBe(false);
        });

        it('should validate locationBlock in validateDhtUpdate/Response', () => {
            const lb = { address: 'addr', dhtSeq: 1, signature: 'a'.repeat(128) };
            // Optional powProof format
            expect(validateDhtResponse({ targetId: 'a'.repeat(32), locationBlock: { ...lb, powProof: '{ "s": "hex" }' } }).valid).toBe(true);
            // Para que falle el regex !/^[0-9a-f]+$/i debe tener un caracter no hex que NO sea {
            expect(validateHandshakeReq({ publicKey: 'a'.repeat(64), powProof: 'z' }).valid).toBe(false);
        });

        it('should validate peer locationBlock in validateDhtExchange', () => {
            const peer = { upeerId: 'a'.repeat(32), publicKey: 'b'.repeat(64) };
            const lb = { address: 'addr', dhtSeq: 1, signature: 'c'.repeat(128) };
            // peer.locationBlock.powProof
            expect(validateDhtExchange({ peers: [{ ...peer, locationBlock: { ...lb, powProof: 'z' } }] }).valid).toBe(false);
            expect(validateDhtExchange({ peers: [{ ...peer, locationBlock: { ...lb, powProof: '{ "s": "hex" }' } }] }).valid).toBe(true);
        });

        it('should validate key lengths in DHT operations', () => {
            const valid = { key: 'a'.repeat(40), value: 'val' };
            expect(validateDhtStore({ ...valid, key: 'a'.repeat(64) }).valid).toBe(true);
            expect(validateDhtStore({ ...valid, key: 'a'.repeat(41) }).valid).toBe(false);
            // key con caracteres no hex
            expect(validateDhtStore({ ...valid, key: 'z'.repeat(40) }).valid).toBe(false);
            // TTL inválido
            expect(validateDhtStore({ ...valid, ttl: -1 }).valid).toBe(false);
            expect(validateDhtStore({ ...valid, ttl: 3000000 }).valid).toBe(false);
        });

        it('should validate file chunk edge cases', () => {
            const base = { fileId: 'f1', chunkIndex: 0, data: 'd' };
            // data too large (limite 200,000)
            expect(validateFileChunk({ ...base, data: 'a'.repeat(200001) }).valid).toBe(false);
            // IV invalid
            expect(validateFileChunk({ ...base, iv: 'short' }).valid).toBe(false);
            // Tag invalid
            expect(validateFileChunk({ ...base, tag: 'short' }).valid).toBe(false);
        });

        it('should validate vault delivery page limit', () => {
            // entries.length > 100
            const manyEntries = new Array(101).fill({ senderSid: 'a', payloadHash: 'b', data: 'c' });
            expect(validateVaultDelivery({ entries: manyEntries }).valid).toBe(false);
        });

        it('should validate group fields', () => {
            // Group leave signature is optional
            expect(validateGroupLeave({ groupId: 'g1' }).valid).toBe(true);
            // Group msg replyTo
            expect(validateGroupMsg({ groupId: 'g1', content: 'c', replyTo: 'short' }).valid).toBe(true);
            expect(validateGroupMsg({ groupId: 'g1', content: 'c', replyTo: 'a'.repeat(101) }).valid).toBe(false);
        });
    });
});
