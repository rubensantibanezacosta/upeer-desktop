import { describe, it, expect } from 'vitest';
import {
    validateMessage,
    validateFileProposal,
    validateFileChunk,
    validateVaultStore,
    validateVaultAck,
    validateVaultDelivery,
    validateVaultRenew,
    validateGroupMsg,
    validateGroupInvite,
    validateChatClear,
    validateDhtStore,
    validateReputationDeliver,
    validateChatContact
} from '../../../src/main_process/security/validation.js';

describe('Security Validation - Stress & Edge Cases', () => {

    describe('validateMessage Router', () => {
        it('should route known types correctly', () => {
            const result = validateMessage('PING', {});
            expect(result.valid).toBe(true);
        });

        it('should reject unknown message types', () => {
            const result = validateMessage('MALICIOUS_TYPE', {});
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Unknown message type');
        });

        it('should handle VAULT_RENEW (BUG Z fix)', () => {
            const valid = { payloadHash: 'a'.repeat(64), newExpiresAt: Date.now() };
            expect(validateMessage('VAULT_RENEW', valid).valid).toBe(true);
            expect(validateVaultRenew(valid).valid).toBe(true);
            expect(validateVaultRenew({ ...valid, payloadHash: 'too-short' }).valid).toBe(false);
        });

        it('should handle GROUP types (BUG Z fix)', () => {
            const validMsg = { groupId: 'g1', content: 'hello' };
            expect(validateMessage('GROUP_MSG', validMsg).valid).toBe(true);
        });
    });

    describe('File Transfer Validation (Defense in Depth)', () => {
        it('should validate FileProposal lengths (BUG DH fix)', () => {
            const base = { fileId: 'f1', fileName: 'test.txt', fileSize: 100 };

            // Valid encryptedKey (96 hex) and nonce (48 hex)
            expect(validateFileProposal({
                ...base,
                encryptedKey: 'a'.repeat(96),
                encryptedKeyNonce: 'b'.repeat(48)
            }).valid).toBe(true);

            // Invalid lengths
            expect(validateFileProposal({ ...base, encryptedKey: 'a'.repeat(95) }).valid).toBe(false);
            expect(validateFileProposal({ ...base, encryptedKeyNonce: 'b'.repeat(47) }).valid).toBe(false);
        });

        it('should prevent OOM via large chunks (BUG CN fix)', () => {
            const base = { fileId: 'f1', chunkIndex: 0, data: 'a'.repeat(200_000) };
            expect(validateFileChunk(base).valid).toBe(true);

            const tooLarge = { ...base, data: 'a'.repeat(200_001) };
            const result = validateFileChunk(tooLarge);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Chunk data too large');
        });

        it('should validate AES-GCM tags and IVs (BUG DI fix)', () => {
            const base = { fileId: 'f1', chunkIndex: 0, data: 'hex' };

            // IV = 12 bytes = 24 hex; Tag = 16 bytes = 32 hex
            expect(validateFileChunk({ ...base, iv: 'a'.repeat(24), tag: 'b'.repeat(32) }).valid).toBe(true);

            expect(validateFileChunk({ ...base, iv: 'a'.repeat(23) }).valid).toBe(false);
            expect(validateFileChunk({ ...base, tag: 'b'.repeat(31) }).valid).toBe(false);
        });
    });

    describe('Vault Validation (Storage Protections)', () => {
        it('should enforce limits on Sid and Hash (BUG DN fix)', () => {
            const base = { payloadHash: 'h', recipientSid: 's', data: 'd' };

            expect(validateVaultStore({ ...base, payloadHash: 'a'.repeat(200), recipientSid: 'b'.repeat(64) }).valid).toBe(true);
            expect(validateVaultStore({ ...base, payloadHash: 'a'.repeat(201) }).valid).toBe(false);
            expect(validateVaultStore({ ...base, recipientSid: 'b'.repeat(65) }).valid).toBe(false);
        });

        it('should prevent massive data blobs in Vault (BUG U fix)', () => {
            const limit = 'a'.repeat(2_000_000);
            expect(validateVaultStore({ payloadHash: 'h', recipientSid: 's', data: limit }).valid).toBe(true);

            const tooBig = 'a'.repeat(2_000_001);
            expect(validateVaultStore({ payloadHash: 'h', recipientSid: 's', data: tooBig }).valid).toBe(false);
        });

        it('should validate VaultAck array strictly (BUG DN fix)', () => {
            expect(validateVaultAck({ payloadHashes: ['a'.repeat(200)] }).valid).toBe(true);
            expect(validateVaultAck({ payloadHashes: ['a'.repeat(201)] }).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: new Array(201).fill('h') }).valid).toBe(false);
        });

        it('should validate VaultDelivery entries (BUG FL fix)', () => {
            const validEntry = { senderSid: 's', payloadHash: 'h', data: 'd' };
            expect(validateVaultDelivery({ entries: [validEntry] }).valid).toBe(true);

            // Malformed entries that could cause crashes
            expect(validateVaultDelivery({ entries: [{ senderSid: 123 }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ senderSid: 's', payloadHash: null }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [null] }).valid).toBe(false);
        });
    });

    describe('DHT and Groups Advanced Validation', () => {
        it('should validate DhtFindNode targetId length and format (BUG CY fix)', () => {
            const valid = { targetId: 'a'.repeat(40) }; // 20 bytes hex
            expect(validateMessage('DHT_FIND_NODE', valid).valid).toBe(true);

            expect(validateMessage('DHT_FIND_NODE', { targetId: 'a'.repeat(129) }).valid).toBe(false);
            expect(validateMessage('DHT_FIND_NODE', { targetId: 'not-hex' }).valid).toBe(false);
        });

        it('should validate DhtFindValue/Store keys (40 or 64 hex only) (BUG DA fix)', () => {
            expect(validateMessage('DHT_FIND_VALUE', { key: 'a'.repeat(40) }).valid).toBe(true);
            expect(validateMessage('DHT_FIND_VALUE', { key: 'a'.repeat(64) }).valid).toBe(true);
            expect(validateMessage('DHT_FIND_VALUE', { key: 'a'.repeat(32) }).valid).toBe(false);
            expect(validateMessage('DHT_FIND_VALUE', { key: 'a'.repeat(60) }).valid).toBe(false);
        });

        it('should validate DhtExchange peers array strictly', () => {
            const peer = { upeerId: 'p'.repeat(64), publicKey: 'k'.repeat(64) };
            expect(validateMessage('DHT_EXCHANGE', { peers: [peer] }).valid).toBe(true);
            expect(validateMessage('DHT_EXCHANGE', { peers: new Array(51).fill(peer) }).valid).toBe(false);
            expect(validateMessage('DHT_EXCHANGE', { peers: [{ ...peer, upeerId: 'short' }] }).valid).toBe(false);
        });

        it('should validate ChatClear signature (BUG DD/Clear fix)', () => {
            const base = { chatUpeerId: 'a'.repeat(64) };
            expect(validateChatClear({ ...base, signature: 's'.repeat(128) }).valid).toBe(true);
            expect(validateChatClear({ ...base, signature: 'short' }).valid).toBe(false);
            expect(validateChatClear(base).valid).toBe(false); // missing sig
        });

        it('should validate DhtStore value serialization', () => {
            // Valid JSON string
            expect(validateDhtStore({ key: 'a'.repeat(64), value: JSON.stringify({ x: 1 }) }).valid).toBe(true);
            // Too large
            expect(validateDhtStore({ key: 'a'.repeat(64), value: 'a'.repeat(10001) }).valid).toBe(false);
        });

        it('should validate GroupMsg fields (BUG FQ/FR fixes)', () => {
            const base = { groupId: 'g1', content: 'hi' };
            expect(validateGroupMsg({ ...base, id: 'a'.repeat(100), replyTo: 'b'.repeat(100) }).valid).toBe(true);
            expect(validateGroupMsg({ ...base, id: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, replyTo: 'b'.repeat(101) }).valid).toBe(false);
        });

        it('should limit GroupInvite payload (BUG AI fix)', () => {
            const limit = 'a'.repeat(500_000);
            const base = { groupId: 'g1', nonce: 'n'.repeat(48) };
            expect(validateGroupInvite({ ...base, payload: limit }).valid).toBe(true);
            expect(validateGroupInvite({ ...base, payload: limit + '!' }).valid).toBe(false);
        });
    });

    describe('Reputation and Contacts', () => {
        it('should validate ReputationGossip and Request strictly', () => {
            const gossip = { ids: ['a'.repeat(64)] };
            expect(validateMessage('REPUTATION_GOSSIP', gossip).valid).toBe(true);
            expect(validateMessage('REPUTATION_GOSSIP', { ids: new Array(501).fill('a'.repeat(64)) }).valid).toBe(false);
            expect(validateMessage('REPUTATION_GOSSIP', { ids: ['short'] }).valid).toBe(false);

            const req = { missing: ['a'.repeat(64)] };
            expect(validateMessage('REPUTATION_REQUEST', req).valid).toBe(true);
            expect(validateMessage('REPUTATION_REQUEST', { missing: new Array(101).fill('a'.repeat(64)) }).valid).toBe(false);
        });

        it('should validate ReputationDeliver vouches strictly', () => {
            const validVouch = {
                id: 'a'.repeat(64), fromId: 'b'.repeat(64), toId: 'c'.repeat(64),
                type: 't', timestamp: Date.now(), signature: 's'.repeat(128)
            };
            expect(validateReputationDeliver({ vouches: [validVouch] }).valid).toBe(true);
            expect(validateReputationDeliver({ vouches: [{ ...validVouch, signature: 'short' }] }).valid).toBe(false);
        });

        it('should validate ChatContact fields', () => {
            const valid = { id: 'msg1', upeerId: 'a'.repeat(64), contactPublicKey: 'b'.repeat(64) };
            expect(validateChatContact(valid).valid).toBe(true);
            expect(validateChatContact({ ...valid, upeerId: 'wrong' }).valid).toBe(false);
        });
    });
});
