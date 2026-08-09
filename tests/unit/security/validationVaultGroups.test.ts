import { describe, expect, it } from 'vitest';
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
    validateReputationGossip,
    validateReputationRequest,
    validateReputationDeliver,
} from '../../../src/main_process/security/validationVaultGroups.js';

const id64 = 'a'.repeat(64);

describe('validationVaultGroups', () => {
    describe('validateVaultStore', () => {
        const base = { payloadHash: 'h'.repeat(64), recipientSid: 'peer-1', data: 'x' };

        it('acepta un store válido', () => {
            expect(validateVaultStore(base).valid).toBe(true);
        });

        it('rechaza payloadHash, recipientSid y data inválidos', () => {
            expect(validateVaultStore({ ...base, payloadHash: '' }).valid).toBe(false);
            expect(validateVaultStore({ ...base, recipientSid: '' }).valid).toBe(false);
            expect(validateVaultStore({ ...base, data: '' }).valid).toBe(false);
            expect(validateVaultStore({ ...base, data: 'x'.repeat(150001) }).valid).toBe(false);
        });
    });

    describe('validateVaultQuery', () => {
        it('acepta requesterSid válido', () => {
            expect(validateVaultQuery({ requesterSid: 'peer-1' }).valid).toBe(true);
        });

        it('rechaza requesterSid inválido', () => {
            expect(validateVaultQuery({}).valid).toBe(false);
            expect(validateVaultQuery({ requesterSid: 'x'.repeat(65) }).valid).toBe(false);
        });
    });

    describe('validateVaultAck', () => {
        it('acepta payloadHashes válido', () => {
            expect(validateVaultAck({ payloadHashes: ['a'.repeat(64)] }).valid).toBe(true);
        });

        it('rechaza no-array, demasiados y hashes inválidos', () => {
            expect(validateVaultAck({}).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: Array(201).fill('a'.repeat(64)) }).valid).toBe(false);
            expect(validateVaultAck({ payloadHashes: [''] }).valid).toBe(false);
        });
    });

    describe('validateVaultDelivery', () => {
        const entry = { senderSid: 'peer-1', payloadHash: 'a'.repeat(64), data: 'x' };

        it('acepta entries válido', () => {
            expect(validateVaultDelivery({ entries: [entry] }).valid).toBe(true);
        });

        it('rechaza no-array, demasiados y entries inválidos', () => {
            expect(validateVaultDelivery({}).valid).toBe(false);
            expect(validateVaultDelivery({ entries: Array(121).fill(entry) }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [null] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ ...entry, senderSid: 42 }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ ...entry, senderSid: 'x'.repeat(129) }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ ...entry, payloadHash: '' }] }).valid).toBe(false);
            expect(validateVaultDelivery({ entries: [{ ...entry, data: 'x'.repeat(20000001) }] }).valid).toBe(false);
        });
    });

    describe('validateVaultRenew', () => {
        it('acepta payloadHash y newExpiresAt válidos', () => {
            expect(validateVaultRenew({ payloadHash: 'a'.repeat(64), newExpiresAt: 100 }).valid).toBe(true);
        });

        it('rechaza campos inválidos', () => {
            expect(validateVaultRenew({ payloadHash: 'short', newExpiresAt: 1 }).valid).toBe(false);
            expect(validateVaultRenew({ payloadHash: 'a'.repeat(64), newExpiresAt: -1 }).valid).toBe(false);
        });
    });

    describe('validateGroupMsg', () => {
        const base = { groupId: 'grp-1', content: 'hola' };

        it('acepta un mensaje válido', () => {
            expect(validateGroupMsg(base).valid).toBe(true);
        });

        it('rechaza groupId, content, nonce, epoch, id y replyTo inválidos', () => {
            expect(validateGroupMsg({ ...base, groupId: '' }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, content: 'x'.repeat(200001) }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, nonce: 'short' }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, epoch: 0 }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, id: 'x'.repeat(101) }).valid).toBe(false);
            expect(validateGroupMsg({ ...base, replyTo: 'x'.repeat(101) }).valid).toBe(false);
        });
    });

    describe('validateGroupAck', () => {
        it('acepta id y groupId válidos', () => {
            expect(validateGroupAck({ id: 'm1', groupId: 'grp-1' }).valid).toBe(true);
        });

        it('rechaza campos inválidos', () => {
            expect(validateGroupAck({ groupId: 'grp-1' }).valid).toBe(false);
            expect(validateGroupAck({ id: 'm1' }).valid).toBe(false);
        });
    });
});

describe('validationVaultGroups (grupos y reputación)', () => {
    const sig128 = 'b'.repeat(128);

    describe('validateGroupInvite / validateGroupUpdate', () => {
        const payload = { payload: 'encrypted', nonce: 'c'.repeat(48) };

        it('acepta payload válido', () => {
            expect(validateGroupInvite({ groupId: 'grp-1', ...payload }).valid).toBe(true);
            expect(validateGroupUpdate({ groupId: 'grp-1', ...payload }).valid).toBe(true);
        });

        it('rechaza groupId, payload y nonce inválidos', () => {
            expect(validateGroupInvite({ groupId: '', ...payload }).valid).toBe(false);
            expect(validateGroupUpdate({ groupId: 'grp-1', payload: '' }).valid).toBe(false);
            expect(validateGroupInvite({ groupId: 'grp-1', payload: 'x'.repeat(500001), nonce: 'c'.repeat(48) }).valid).toBe(false);
            expect(validateGroupUpdate({ groupId: 'grp-1', payload: 'enc', nonce: 'short' }).valid).toBe(false);
        });

        it('valida x3dhInit y ratchetHeader', () => {
            const x = { groupId: 'grp-1', ...payload, x3dhInit: { ikPub: id64, ekPub: id64, spkId: 1 } };
            expect(validateGroupInvite(x).valid).toBe(true);
            expect(validateGroupInvite({ ...x, x3dhInit: { ikPub: 'short' } }).valid).toBe(false);
            expect(validateGroupInvite({ ...x, ratchetHeader: { dh: id64, pn: -1, n: 0 } }).valid).toBe(false);
        });
    });

    describe('validateGroupLeave', () => {
        it('acepta groupId y signature', () => {
            expect(validateGroupLeave({ groupId: 'grp-1', signature: sig128 }).valid).toBe(true);
        });

        it('rechaza campos inválidos', () => {
            expect(validateGroupLeave({ groupId: '' }).valid).toBe(false);
            expect(validateGroupLeave({ groupId: 'grp-1', signature: 'short' }).valid).toBe(false);
        });
    });

    describe('validateReputationGossip / validateReputationRequest', () => {
        it('acepta arrays de ids válidos', () => {
            expect(validateReputationGossip({ ids: [id64] }).valid).toBe(true);
            expect(validateReputationRequest({ missing: [id64] }).valid).toBe(true);
        });

        it('rechaza no-array, demasiados e ids inválidos', () => {
            expect(validateReputationGossip({}).valid).toBe(false);
            expect(validateReputationGossip({ ids: Array(501).fill(id64) }).valid).toBe(false);
            expect(validateReputationGossip({ ids: ['short'] }).valid).toBe(false);
            expect(validateReputationRequest({ missing: Array(101).fill(id64) }).valid).toBe(false);
        });
    });

    describe('validateReputationDeliver', () => {
        const vouch = { id: id64, fromId: id64, toId: id64, type: 'endorse', timestamp: 100, signature: sig128 };

        it('acepta vouches válido', () => {
            expect(validateReputationDeliver({ vouches: [vouch] }).valid).toBe(true);
        });

        it('rechaza no-array, demasiados y campos inválidos', () => {
            expect(validateReputationDeliver({}).valid).toBe(false);
            expect(validateReputationDeliver({ vouches: Array(51).fill(vouch) }).valid).toBe(false);
            expect(validateReputationDeliver({ vouches: [{ ...vouch, id: 'short' }] }).valid).toBe(false);
            expect(validateReputationDeliver({ vouches: [{ ...vouch, type: '' }] }).valid).toBe(false);
            expect(validateReputationDeliver({ vouches: [{ ...vouch, timestamp: 'x' }] }).valid).toBe(false);
            expect(validateReputationDeliver({ vouches: [{ ...vouch, signature: 'short' }] }).valid).toBe(false);
        });
    });
});
