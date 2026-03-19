
import { describe, it, expect } from 'vitest';
import {
    validateVaultStore,
    validateVaultQuery,
    validateVaultAck,
    validateVaultDelivery,
    validateVaultRenew,
    validateGroupMsg,
    validateGroupAck,
    validateGroupInvite,
    validateGroupUpdate,
    validateGroupLeave,
    validateChatContact,
    validateReputationGossip,
    validateReputationRequest,
    validateReputationDeliver,
    validateMessage
} from '../../../src/main_process/security/validation';

describe('Validation - Advanced Components', () => {

    describe('Vault Validation', () => {
        it('should validate Vault Store (limits and types)', () => {
            expect(validateVaultStore({ payloadHash: 'a'.repeat(64), recipientSid: 'b'.repeat(32), data: 'deadbeef' }).valid).toBe(true);
            // Too long payloadHash (limit 200)
            expect(validateVaultStore({ payloadHash: 'a'.repeat(201), recipientSid: 'b'.repeat(32), data: 'f' }).valid).toBe(false);
            // Too long recipientSid (limit 64)
            expect(validateVaultStore({ payloadHash: 'a'.repeat(64), recipientSid: 'b'.repeat(65), data: 'f' }).valid).toBe(false);
            // Data too large (limit 2,000,000)
            expect(validateVaultStore({ payloadHash: 'a'.repeat(64), recipientSid: 'b', data: 'f'.repeat(2000001) }).valid).toBe(false);
        });

        it('should validate Vault Query', () => {
            expect(validateVaultQuery({ requesterSid: 'a'.repeat(32) }).valid).toBe(true);
            expect(validateVaultQuery({ requesterSid: 'a'.repeat(65) }).valid).toBe(false);
            expect(validateVaultQuery({ requesterSid: 123 }).valid).toBe(false);
        });

        it('should validate Vault Ack', () => {
            expect(validateVaultAck({ payloadHashes: ['hash1', 'hash2'] }).valid).toBe(true);
            expect(validateVaultAck({ payloadHashes: 'not-an-array' }).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: Array(201).fill('h') }).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: ['a'.repeat(201)] }).valid).toBe(false);
        });

        it('should validate Vault Delivery (deep checks)', () => {
            const validEntry = { senderSid: 's', payloadHash: 'h', data: 'd' };
            expect(validateVaultDelivery({ entries: [validEntry] }).valid).toBe(true);
            expect(validateVaultDelivery({ entries: 'not-array' }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: Array(101).fill(validEntry) }).valid).toBe(false);

            // Invalid entry structure
            expect(validateVaultDelivery({ entries: [null] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ senderSid: 123 }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ senderSid: 'a', payloadHash: 'b'.repeat(201) }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ senderSid: 'a', payloadHash: 'b', data: 'f'.repeat(20000001) }] }).valid).toBe(false);
        });

        it('should validate Vault Renew', () => {
            const valid = { payloadHash: 'a'.repeat(64), newExpiresAt: Date.now() };
            expect(validateVaultRenew(valid).valid).toBe(true);
            expect(validateVaultRenew({ ...valid, payloadHash: 'short' }).valid).toBe(false);
            expect(validateVaultRenew({ ...valid, newExpiresAt: 'not-number' }).valid).toBe(false);
        });
    });

    describe('Group Validation', () => {
        it('should validate Group Messages', () => {
            const base = { groupId: 'g1', content: 'hello', id: 'm1', replyTo: 'm0' };
            expect(validateGroupMsg(base).valid).toBe(true);
            expect(validateGroupMsg({ ...base, groupId: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, content: 'a'.repeat(200001) }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, id: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, replyTo: 'a'.repeat(101) }).valid).toBe(false);
        });

        it('should validate Group Ack', () => {
            expect(validateGroupAck({ id: 'm1', groupId: 'g1' }).valid).toBe(true);
            expect(validateGroupAck({ id: 'a'.repeat(101), groupId: 'g1' }).valid).toBe(false);
        });

        it('should validate Group Invites and Updates', () => {
            const payload = { groupId: 'g1', payload: 'hexdata', nonce: 'n'.repeat(48) };
            expect(validateGroupInvite(payload).valid).toBe(true);
            expect(validateGroupUpdate(payload).valid).toBe(true);

            expect(validateGroupInvite({ ...payload, payload: 'a'.repeat(500001) }).valid).toBe(false);
            expect(validateGroupInvite({ ...payload, nonce: 'short' }).valid).toBe(false);
            expect(validateGroupInvite({ ...payload, groupId: undefined }).valid).toBe(false);
            expect(validateGroupInvite({ ...payload, payload: undefined }).valid).toBe(false);

            expect(validateGroupUpdate({ ...payload, payload: 'a'.repeat(500001) }).valid).toBe(false);
            expect(validateGroupUpdate({ ...payload, nonce: 'short' }).valid).toBe(false);
            expect(validateGroupUpdate({ ...payload, groupId: undefined }).valid).toBe(false);
            expect(validateGroupUpdate({ ...payload, payload: undefined }).valid).toBe(false);
        });

        it('should validate Group Leave', () => {
            expect(validateGroupLeave({ groupId: 'g1', signature: 's'.repeat(128) }).valid).toBe(true);
            expect(validateGroupLeave({ groupId: 'g1', signature: 'invalid' }).valid).toBe(false);
            expect(validateGroupLeave({ groupId: 123 }).valid).toBe(false);
        });
    });

    describe('Chat Contact Validation', () => {
        it('should validate Chat Contact', () => {
            const valid = { id: '1', upeerId: 'a'.repeat(32), contactPublicKey: 'b'.repeat(64), contactName: 'N', contactAddress: 'A' };
            expect(validateChatContact(valid).valid).toBe(true);
            expect(validateChatContact({ ...valid, id: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateChatContact({ ...valid, upeerId: 'short' }).valid).toBe(false);
            expect(validateChatContact({ ...valid, contactName: 'a'.repeat(101) }).valid).toBe(false);
            expect(validateChatContact({ ...valid, contactAddress: 123 }).valid).toBe(false);
            expect(validateChatContact({ ...valid, contactPublicKey: 'short' }).valid).toBe(false);
        });
    });

    describe('Reputation Validation', () => {
        it('should validate Reputation Gossip', () => {
            expect(validateReputationGossip({ ids: ['a'.repeat(64)] }).valid).toBe(true);
            expect(validateReputationGossip({ ids: Array(501).fill('a'.repeat(64)) }).valid).toBe(false);
            expect(validateReputationGossip({ ids: ['short'] }).valid).toBe(false);
        });

        it('should validate Reputation Request', () => {
            expect(validateReputationRequest({ missing: ['a'.repeat(64)] }).valid).toBe(true);
            expect(validateReputationRequest({ missing: Array(101).fill('a'.repeat(64)) }).valid).toBe(false);
        });

        it('should validate Reputation Deliver', () => {
            const validVouch = {
                id: 'a'.repeat(64),
                fromId: 'b'.repeat(32),
                toId: 'c'.repeat(32),
                type: 'vouch',
                timestamp: Date.now(),
                signature: 's'.repeat(128)
            };
            expect(validateReputationDeliver({ vouches: [validVouch] }).valid).toBe(true);
            expect(validateReputationDeliver({ vouches: Array(51).fill(validVouch) }).valid).toBe(false);
            expect(validateReputationDeliver({ vouches: [{ ...validVouch, signature: 'short' }] }).valid).toBe(false);
        });
    });

    describe('Router Integration (validateMessage)', () => {
        it('should route all new types correctly', () => {
            // Handshake types
            expect(validateMessage('HANDSHAKE_REQ', { publicKey: 'a'.repeat(64) }).valid).toBe(true);
            expect(validateMessage('HANDSHAKE_ACCEPT', { publicKey: 'a'.repeat(64) }).valid).toBe(true);

            // Chat types
            expect(validateMessage('CHAT', { id: '1', content: 'c' }).valid).toBe(true);
            expect(validateMessage('ACK', { id: '1' }).valid).toBe(true);
            expect(validateMessage('READ', { id: '1' }).valid).toBe(true);
            expect(validateMessage('TYPING', {}).valid).toBe(true);
            expect(validateMessage('PING', {}).valid).toBe(true);
            expect(validateMessage('PONG', {}).valid).toBe(true);
            expect(validateMessage('CHAT_CONTACT', { id: '1', upeerId: 'a'.repeat(32), contactPublicKey: 'b'.repeat(64) }).valid).toBe(true);
            expect(validateMessage('CHAT_REACTION', { msgId: '1', emoji: '👍', remove: false }).valid).toBe(true);
            expect(validateMessage('CHAT_UPDATE', { msgId: '1', content: 'c' }).valid).toBe(true);
            expect(validateMessage('CHAT_DELETE', { msgId: '1' }).valid).toBe(true);
            expect(validateMessage('CHAT_CLEAR_ALL', { chatUpeerId: 'a'.repeat(32), signature: 's'.repeat(128) }).valid).toBe(true);

            // DHT types
            expect(validateMessage('DHT_QUERY', { targetId: 'a'.repeat(32) }).valid).toBe(true);
            expect(validateMessage('DHT_RESPONSE', { targetId: 'a'.repeat(32) }).valid).toBe(true);
            expect(validateMessage('DHT_UPDATE', { locationBlock: { address: 'a', dhtSeq: 1, signature: 's'.repeat(128) } }).valid).toBe(true);
            expect(validateMessage('DHT_EXCHANGE', { peers: [] }).valid).toBe(true);
            expect(validateMessage('DHT_FIND_NODE', { targetId: 'abc' }).valid).toBe(true);
            expect(validateMessage('DHT_FIND_VALUE', { key: 'a'.repeat(40) }).valid).toBe(true);
            expect(validateMessage('DHT_STORE', { key: 'a'.repeat(40), value: 'v' }).valid).toBe(true);
            expect(validateMessage('DHT_STORE_ACK', { key: 'a'.repeat(40) }).valid).toBe(true);

            // File types
            expect(validateMessage('FILE_PROPOSAL', { fileId: 'f', fileName: 'n', fileSize: 1 }).valid).toBe(true);
            expect(validateMessage('FILE_START', { fileId: 'f', fileName: 'n', fileSize: 1 }).valid).toBe(true);
            expect(validateMessage('FILE_ACCEPT', { fileId: 'f' }).valid).toBe(true);
            expect(validateMessage('FILE_CHUNK', { fileId: 'f', chunkIndex: 0, data: 'd' }).valid).toBe(true);
            expect(validateMessage('FILE_CHUNK_ACK', { fileId: 'f', chunkIndex: 0 }).valid).toBe(true);
            expect(validateMessage('FILE_ACK', { fileId: 'f', chunkIndex: 0 }).valid).toBe(true);
            expect(validateMessage('FILE_DONE_ACK', { fileId: 'f' }).valid).toBe(true);
            expect(validateMessage('FILE_END', { fileId: 'f' }).valid).toBe(true);
            expect(validateMessage('FILE_CANCEL', { fileId: 'f' }).valid).toBe(true);

            // Vault types
            expect(validateMessage('VAULT_STORE', { payloadHash: 'a', recipientSid: 'b', data: 'd' }).valid).toBe(true);
            expect(validateMessage('VAULT_QUERY', { requesterSid: 'a' }).valid).toBe(true);
            expect(validateMessage('VAULT_ACK', { payloadHashes: [] }).valid).toBe(true);
            expect(validateMessage('VAULT_DELIVERY', { entries: [] }).valid).toBe(true);
            expect(validateMessage('VAULT_RENEW', { payloadHash: 'a'.repeat(64), newExpiresAt: 1 }).valid).toBe(true);

            // Group types
            expect(validateMessage('GROUP_MSG', { groupId: 'g', content: 'c' }).valid).toBe(true);
            expect(validateMessage('GROUP_ACK', { id: 'm', groupId: 'g' }).valid).toBe(true);
            expect(validateMessage('GROUP_INVITE', { groupId: 'g', payload: 'p', nonce: 'n'.repeat(48) }).valid).toBe(true);
            expect(validateMessage('GROUP_UPDATE', { groupId: 'g', payload: 'p', nonce: 'n'.repeat(48) }).valid).toBe(true);
            expect(validateMessage('GROUP_LEAVE', { groupId: 'g' }).valid).toBe(true);

            // Reputation types
            expect(validateMessage('REPUTATION_GOSSIP', { ids: [] }).valid).toBe(true);
            expect(validateMessage('REPUTATION_REQUEST', { missing: [] }).valid).toBe(true);
            expect(validateMessage('REPUTATION_DELIVER', { vouches: [] }).valid).toBe(true);

            // Unknown type
            expect(validateMessage('UNKNOWN_TYPE', {}).valid).toBe(false);
        });
    });
});
