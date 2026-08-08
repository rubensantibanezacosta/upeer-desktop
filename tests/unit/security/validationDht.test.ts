import { describe, expect, it } from 'vitest';
import {
    validateDhtQuery,
    validateDhtResponse,
    validateDhtUpdate,
    validateDhtExchange,
    validateDhtFindNode,
    validateDhtFindValue,
    validateDhtStore,
    validateDhtStoreAck,
    validateDhtFoundNodes,
    validateDhtFoundValue,
    validateDhtPing,
    validateDhtPong,
    validateSyncPulse,
} from '../../../src/main_process/security/validationDht.js';

const id64 = 'a'.repeat(64);
const key40 = 'b'.repeat(40);
const sig128 = 'c'.repeat(128);

describe('validationDht', () => {
    describe('validateDhtQuery', () => {
        it('acepta targetId válido', () => {
            expect(validateDhtQuery({ targetId: id64 }).valid).toBe(true);
        });

        it('rechaza targetId inválido', () => {
            expect(validateDhtQuery({ targetId: 'short' }).valid).toBe(false);
            expect(validateDhtQuery({}).valid).toBe(false);
        });
    });

    describe('validateDhtResponse', () => {
        it('acepta respuesta válida', () => {
            expect(validateDhtResponse({ targetId: id64 }).valid).toBe(true);
        });

        it('rechaza targetId, locationBlock y neighbors inválidos', () => {
            expect(validateDhtResponse({ targetId: 'bad' }).valid).toBe(false);
            expect(validateDhtResponse({ targetId: id64, locationBlock: { address: '', dhtSeq: 1, signature: sig128 } }).valid).toBe(false);
            expect(validateDhtResponse({ targetId: id64, neighbors: 'x' }).valid).toBe(false);
        });
    });

    describe('validateDhtUpdate', () => {
        it('acepta locationBlock válido y rechaza inválido', () => {
            expect(validateDhtUpdate({ locationBlock: { address: '200::1', dhtSeq: 1, signature: sig128 } }).valid).toBe(true);
            expect(validateDhtUpdate({}).valid).toBe(false);
        });
    });

    describe('validateDhtExchange', () => {
        const peer = { upeerId: id64, publicKey: 'd'.repeat(64) };

        it('acepta intercambio válido', () => {
            expect(validateDhtExchange({ peers: [peer] }).valid).toBe(true);
        });

        it('rechaza peers no array y demasiados peers', () => {
            expect(validateDhtExchange({}).valid).toBe(false);
            expect(validateDhtExchange({ peers: Array.from({ length: 51 }, () => peer) }).valid).toBe(false);
        });

        it('rechaza peer con upeerId, publicKey o locationBlock inválidos', () => {
            expect(validateDhtExchange({ peers: [{ ...peer, upeerId: 'short' }] }).valid).toBe(false);
            expect(validateDhtExchange({ peers: [{ ...peer, publicKey: 'short' }] }).valid).toBe(false);
            expect(validateDhtExchange({ peers: [{ ...peer, locationBlock: { dhtSeq: 1, signature: sig128 } }] }).valid).toBe(false);
        });
    });

    describe('validateDhtFindNode', () => {
        it('acepta targetId válido', () => {
            expect(validateDhtFindNode({ targetId: id64 }).valid).toBe(true);
        });

        it('rechaza targetId inválido', () => {
            expect(validateDhtFindNode({ targetId: 'zz' }).valid).toBe(false);
            expect(validateDhtFindNode({}).valid).toBe(false);
        });
    });

    describe('validateDhtFindValue / validateDhtStoreAck', () => {
        it('acepta claves de 40/64 hex', () => {
            expect(validateDhtFindValue({ key: key40 }).valid).toBe(true);
            expect(validateDhtStoreAck({ key: 'b'.repeat(64) }).valid).toBe(true);
        });

        it('rechaza claves inválidas', () => {
            expect(validateDhtFindValue({ key: 'short' }).valid).toBe(false);
            expect(validateDhtStoreAck({ key: 'zz'.repeat(40) }).valid).toBe(false);
        });
    });

    describe('validateDhtStore', () => {
        const base = { key: key40, value: { data: 'x' } };

        it('acepta un store válido', () => {
            expect(validateDhtStore(base).valid).toBe(true);
        });

        it('rechaza key, value y ttl inválidos', () => {
            expect(validateDhtStore({ ...base, key: 'short' }).valid).toBe(false);
            expect(validateDhtStore({ ...base, value: undefined }).valid).toBe(false);
            expect(validateDhtStore({ ...base, ttl: -1 }).valid).toBe(false);
            expect(validateDhtStore({ ...base, ttl: 3000000 }).valid).toBe(false);
        });
    });

    describe('validateDhtFoundNodes', () => {
        const node = { upeerId: id64, address: '200::1' };

        it('acepta nodos válidos', () => {
            expect(validateDhtFoundNodes({ nodes: [node] }).valid).toBe(true);
        });

        it('rechaza nodes no array, demasiados y entradas inválidas', () => {
            expect(validateDhtFoundNodes({}).valid).toBe(false);
            expect(validateDhtFoundNodes({ nodes: Array.from({ length: 21 }, () => node) }).valid).toBe(false);
            expect(validateDhtFoundNodes({ nodes: [null] }).valid).toBe(false);
            expect(validateDhtFoundNodes({ nodes: [{ upeerId: 'zz', address: '200::1' }] }).valid).toBe(false);
            expect(validateDhtFoundNodes({ nodes: [{ upeerId: id64, address: 'x'.repeat(101) }] }).valid).toBe(false);
        });
    });

    describe('validateDhtFoundValue', () => {
        it('acepta con value o nodes', () => {
            expect(validateDhtFoundValue({ value: { a: 1 } }).valid).toBe(true);
            expect(validateDhtFoundValue({ nodes: [] }).valid).toBe(true);
        });

        it('rechaza sin value ni nodes, key o value inválidos', () => {
            expect(validateDhtFoundValue({}).valid).toBe(false);
            expect(validateDhtFoundValue({ key: 'short', value: 1 }).valid).toBe(false);
            expect(validateDhtFoundValue({ value: undefined }).valid).toBe(false);
        });
    });

    describe('validateDhtPing / validateDhtPong', () => {
        it('acepta nodeId válido', () => {
            expect(validateDhtPing({ nodeId: id64 }).valid).toBe(true);
            expect(validateDhtPong({ nodeId: id64 }).valid).toBe(true);
        });

        it('rechaza nodeId inválido', () => {
            expect(validateDhtPing({ nodeId: 'zz' }).valid).toBe(false);
            expect(validateDhtPong({ nodeId: 'x'.repeat(129) }).valid).toBe(false);
        });
    });

    describe('validateSyncPulse', () => {
        it('acepta un pulse válido', () => {
            expect(validateSyncPulse({ action: 'sync' }).valid).toBe(true);
        });

        it('rechaza action, deviceId, messageId y newContent inválidos', () => {
            expect(validateSyncPulse({}).valid).toBe(false);
            expect(validateSyncPulse({ action: 'x'.repeat(51) }).valid).toBe(false);
            expect(validateSyncPulse({ action: 'sync', deviceId: 42 }).valid).toBe(false);
            expect(validateSyncPulse({ action: 'sync', messageId: 7 }).valid).toBe(false);
            expect(validateSyncPulse({ action: 'sync', newContent: 'x'.repeat(50001) }).valid).toBe(false);
        });
    });
});
