/**
 * Tests para el sistema de reputación G-Set CRDT.
 *
 * Solo importa vouches-pure.ts (sin SQLite, sin Electron).
 * Ejecutar con:
 *   npx tsx --test tests/reputation-vouches.test.ts
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

import {
    VouchType,
    VOUCH_WEIGHTS,
    VOUCH_POSITIVE,
    THIRTY_DAYS_MS,
    MAX_CONTRIBUTING_VOUCHES_PER_SENDER,
    computeVouchId,
    computeScorePure,
    type StoredVouch,
} from '../src/main_process/security/reputation/vouches-pure.js';

// ── Storage in-memory (misma semántica que el módulo SQLite) ─────────────────

let store: Map<string, StoredVouch>;

function resetStore() { store = new Map(); }

function insertVouch(v: StoredVouch): void {
    store.set(v.id, v); // .set es idempotente: misma clave → sobrescribe igual valor
}

function vouchExists(id: string): boolean {
    return store.has(id);
}

function getVouchIds(since: number): string[] {
    return [...store.values()]
        .filter(v => v.timestamp >= since)
        .map(v => v.id);
}

function getVouchesByIds(ids: string[]): StoredVouch[] {
    if (ids.length === 0) return [];
    return ids.flatMap(id => (store.has(id) ? [store.get(id)!] : []));
}

function getVouchesForNode(toId: string, since: number): StoredVouch[] {
    return [...store.values()].filter(v => v.toId === toId && v.timestamp >= since);
}

function countRecentVouchesByFrom(fromId: string, since: number): number {
    return [...store.values()].filter(v => v.fromId === fromId && v.timestamp >= since).length;
}

/** Calcula score con la misma semántica que computeScore (DB → computeScorePure). */
function computeScore(toId: string, directContactIds: Set<string>): number {
    const vouches = getVouchesForNode(toId, Date.now() - THIRTY_DAYS_MS);
    return computeScorePure(vouches, directContactIds);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakeId(seed: number): string {
    return crypto.createHash('sha256').update(`peer-${seed}`).digest('hex').slice(0, 32);
}

function makeVouch(
    fromId: string,
    toId: string,
    type: VouchType,
    overrides: Partial<StoredVouch> = {},
): StoredVouch {
    const timestamp = Date.now() - Math.floor(Math.random() * 1000);
    const id = computeVouchId(fromId, toId, type, timestamp);
    return {
        id,
        fromId,
        toId,
        type,
        positive: VOUCH_POSITIVE[type],
        timestamp,
        signature: 'fakesig'.padEnd(128, '0'),
        receivedAt: Date.now(),
        ...overrides,
    };
}

// ── Suite principal ───────────────────────────────────────────────────────────

describe('Sistema de reputación G-Set CRDT', () => {
    beforeEach(() => resetStore());

    // ── computeVouchId ────────────────────────────────────────────────────────

    describe('computeVouchId', () => {
        it('devuelve un string hex de 64 caracteres (sha256)', () => {
            const id = computeVouchId('aaaa', 'bbbb', VouchType.HANDSHAKE, 1234567890);
            assert.strictEqual(typeof id, 'string');
            assert.strictEqual(id.length, 64);
            assert.ok(/^[0-9a-f]+$/.test(id), 'Debe ser hex válido');
        });

        it('es determinista: mismos inputs → mismo ID', () => {
            const ts = 1700000000000;
            const id1 = computeVouchId('alice', 'bob', VouchType.HANDSHAKE, ts);
            const id2 = computeVouchId('alice', 'bob', VouchType.HANDSHAKE, ts);
            assert.strictEqual(id1, id2);
        });

        it('cambia si cambia cualquier campo', () => {
            const base = computeVouchId('alice', 'bob', VouchType.HANDSHAKE, 1000);
            assert.notStrictEqual(base, computeVouchId('alice2', 'bob', VouchType.HANDSHAKE, 1000));
            assert.notStrictEqual(base, computeVouchId('alice', 'bob2', VouchType.HANDSHAKE, 1000));
            assert.notStrictEqual(base, computeVouchId('alice', 'bob', VouchType.SPAM, 1000));
            assert.notStrictEqual(base, computeVouchId('alice', 'bob', VouchType.HANDSHAKE, 1001));
        });
    });

    // ── Constantes ────────────────────────────────────────────────────────────

    describe('VOUCH_WEIGHTS y VOUCH_POSITIVE', () => {
        it('todos los VouchType tienen peso definido', () => {
            for (const type of Object.values(VouchType)) {
                assert.ok(VOUCH_WEIGHTS[type] !== undefined, `Falta peso para ${type}`);
                assert.ok(VOUCH_WEIGHTS[type] > 0, `Peso debe ser > 0 para ${type}`);
            }
        });

        it('los negativos tienen positive=false', () => {
            assert.strictEqual(VOUCH_POSITIVE[VouchType.SPAM], false);
            assert.strictEqual(VOUCH_POSITIVE[VouchType.MALICIOUS], false);
            assert.strictEqual(VOUCH_POSITIVE[VouchType.INTEGRITY_FAIL], false);
        });

        it('los positivos tienen positive=true', () => {
            assert.strictEqual(VOUCH_POSITIVE[VouchType.HANDSHAKE], true);
            assert.strictEqual(VOUCH_POSITIVE[VouchType.VAULT_HELPED], true);
            assert.strictEqual(VOUCH_POSITIVE[VouchType.VAULT_RETRIEVED], true);
            assert.strictEqual(VOUCH_POSITIVE[VouchType.VAULT_CHUNK], true);
        });

        it('INTEGRITY_FAIL tiene el mayor peso negativo', () => {
            assert.ok(VOUCH_WEIGHTS[VouchType.INTEGRITY_FAIL] > VOUCH_WEIGHTS[VouchType.MALICIOUS]);
            assert.ok(VOUCH_WEIGHTS[VouchType.MALICIOUS] > VOUCH_WEIGHTS[VouchType.SPAM]);
        });
    });

    // ── Storage in-memory ─────────────────────────────────────────────────────

    describe('insertVouch / vouchExists', () => {
        it('inserta un vouch y lo encuentra con vouchExists', () => {
            const v = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE);
            assert.strictEqual(vouchExists(v.id), false, 'No debe existir antes de insertar');
            insertVouch(v);
            assert.strictEqual(vouchExists(v.id), true, 'Debe existir tras insertar');
        });

        it('insert es idempotente (no lanza en duplicado)', () => {
            const v = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE);
            insertVouch(v);
            assert.doesNotThrow(() => insertVouch(v), 'Insert duplicado no debe lanzar');
        });

        it('vouchExists devuelve false para ID desconocido', () => {
            assert.strictEqual(vouchExists('a'.repeat(64)), false);
        });
    });

    describe('getVouchIds', () => {
        it('devuelve IDs insertados en el rango de tiempo dado', () => {
            const now = Date.now();
            const v1 = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE, { timestamp: now - 1000 });
            const v2 = makeVouch(fakeId(3), fakeId(4), VouchType.SPAM, { timestamp: now - 2000 });
            insertVouch(v1);
            insertVouch(v2);
            const ids = getVouchIds(now - 5000);
            assert.ok(ids.includes(v1.id), 'Debe incluir v1');
            assert.ok(ids.includes(v2.id), 'Debe incluir v2');
        });

        it('filtra por timestamp since', () => {
            const now = Date.now();
            const old = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE, { timestamp: now - 100_000 });
            const recent = makeVouch(fakeId(3), fakeId(4), VouchType.HANDSHAKE, { timestamp: now - 100 });
            insertVouch(old);
            insertVouch(recent);
            const ids = getVouchIds(now - 1000);
            assert.ok(ids.includes(recent.id), 'recent debe estar');
            assert.ok(!ids.includes(old.id), 'old NO debe estar');
        });
    });

    describe('getVouchesByIds', () => {
        it('devuelve los vouches solicitados', () => {
            const v1 = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE);
            const v2 = makeVouch(fakeId(3), fakeId(4), VouchType.VAULT_CHUNK);
            insertVouch(v1);
            insertVouch(v2);
            const result = getVouchesByIds([v1.id, v2.id]);
            assert.strictEqual(result.length, 2);
            const ids = result.map(v => v.id);
            assert.ok(ids.includes(v1.id));
            assert.ok(ids.includes(v2.id));
        });

        it('devuelve array vacío si no hay coincidencias', () => {
            const result = getVouchesByIds(['a'.repeat(64)]);
            assert.strictEqual(result.length, 0);
        });

        it('devuelve array vacío si ids está vacío', () => {
            assert.deepStrictEqual(getVouchesByIds([]), []);
        });
    });

    describe('getVouchesForNode', () => {
        it('devuelve solo los vouches cuyo toId coincide', () => {
            const alice = fakeId(1); const bob = fakeId(2); const carol = fakeId(3);
            const vAB = makeVouch(alice, bob, VouchType.HANDSHAKE);
            const vCB = makeVouch(carol, bob, VouchType.VAULT_CHUNK);
            const vAC = makeVouch(alice, carol, VouchType.HANDSHAKE);
            insertVouch(vAB); insertVouch(vCB); insertVouch(vAC);
            const forBob = getVouchesForNode(bob, 0);
            assert.strictEqual(forBob.length, 2);
            const ids = forBob.map(v => v.id);
            assert.ok(ids.includes(vAB.id));
            assert.ok(ids.includes(vCB.id));
            assert.ok(!ids.includes(vAC.id));
        });
    });

    describe('countRecentVouchesByFrom', () => {
        it('cuenta solo los vouches del emisor en el rango dado', () => {
            const alice = fakeId(1); const bob = fakeId(2); const carol = fakeId(3);
            const now = Date.now();
            insertVouch(makeVouch(alice, bob, VouchType.HANDSHAKE, { timestamp: now - 100 }));
            insertVouch(makeVouch(alice, carol, VouchType.VAULT_CHUNK, { timestamp: now - 200 }));
            insertVouch(makeVouch(bob, carol, VouchType.HANDSHAKE, { timestamp: now - 300 }));
            assert.strictEqual(countRecentVouchesByFrom(alice, now - 1000), 2);
            assert.strictEqual(countRecentVouchesByFrom(bob, now - 1000), 1);
        });
    });

    // ── computeScorePure / computeScore ───────────────────────────────────────

    describe('computeScore', () => {
        it('devuelve 50 (neutral) si no hay vouches', () => {
            const score = computeScore(fakeId(2), new Set([fakeId(1)]));
            assert.strictEqual(score, 50);
        });

        it('sube con vouches positivos de contactos directos', () => {
            const alice = fakeId(1); const bob = fakeId(2);
            insertVouch(makeVouch(alice, bob, VouchType.HANDSHAKE));
            const score = computeScore(bob, new Set([alice]));
            assert.ok(score > 50, `Score debe ser > 50, fue ${score}`);
        });

        it('baja con vouches negativos de contactos directos', () => {
            const alice = fakeId(1); const bob = fakeId(2);
            insertVouch(makeVouch(alice, bob, VouchType.MALICIOUS));
            const score = computeScore(bob, new Set([alice]));
            assert.ok(score < 50, `Score debe ser < 50, fue ${score}`);
        });

        it('INTEGRITY_FAIL lleva el score por debajo de 40 (untrusted)', () => {
            const alice = fakeId(1); const bob = fakeId(2);
            insertVouch(makeVouch(alice, bob, VouchType.INTEGRITY_FAIL));
            const score = computeScore(bob, new Set([alice]));
            assert.ok(score < 40, `Score debe ser < 40, fue ${score}`);
        });

        it('score permanece 50 si los vouches vienen de no-contactos (Sybil ring)', () => {
            const sybil1 = fakeId(10); const sybil2 = fakeId(11); const sybil3 = fakeId(12);
            const victim = fakeId(20);
            insertVouch(makeVouch(sybil1, victim, VouchType.VAULT_CHUNK));
            insertVouch(makeVouch(sybil2, victim, VouchType.VAULT_CHUNK));
            insertVouch(makeVouch(sybil3, victim, VouchType.VAULT_CHUNK));
            const score = computeScore(victim, new Set([fakeId(99)]));
            assert.strictEqual(score, 50, `Ring de Sybils no debe afectar el score (fue ${score})`);
        });

        it('respeta rate limit de contribución por emisor (máx 10)', () => {
            const alice = fakeId(1); const target = fakeId(2);
            // Alice emite 15 vouches (solo 10 deben contar)
            for (let i = 0; i < 15; i++) {
                const ts = Date.now() - i * 10;
                insertVouch({
                    id: computeVouchId(alice, target, VouchType.HANDSHAKE, ts),
                    fromId: alice, toId: target,
                    type: VouchType.HANDSHAKE, positive: true,
                    timestamp: ts, signature: 'fake'.padEnd(128, '0'), receivedAt: Date.now(),
                });
            }
            const score = computeScore(target, new Set([alice]));
            const maxPossible = 50 + MAX_CONTRIBUTING_VOUCHES_PER_SENDER * VOUCH_WEIGHTS[VouchType.HANDSHAKE];
            assert.ok(
                score <= maxPossible,
                `Score con 15 vouches (${score}) no debe superar el límite de 10 (${maxPossible})`,
            );
        });

        it('el score está siempre entre 0 y 100', () => {
            const alice = fakeId(1); const target = fakeId(2); const victim = fakeId(3);
            // Vouches extremadamente positivos
            for (let i = 0; i < 30; i++) {
                const ts = Date.now() - i * 10;
                insertVouch({
                    id: computeVouchId(alice, target, VouchType.VAULT_CHUNK, ts),
                    fromId: alice, toId: target,
                    type: VouchType.VAULT_CHUNK, positive: true,
                    timestamp: ts, signature: 'fake'.padEnd(128, '0'), receivedAt: Date.now(),
                });
            }
            const highScore = computeScore(target, new Set([alice]));
            assert.ok(highScore >= 0 && highScore <= 100, `Score fuera de rango: ${highScore}`);

            // Vouches extremadamente negativos
            for (let i = 0; i < 30; i++) {
                const ts = Date.now() - i * 10;
                insertVouch({
                    id: computeVouchId(alice, victim, VouchType.INTEGRITY_FAIL, ts),
                    fromId: alice, toId: victim,
                    type: VouchType.INTEGRITY_FAIL, positive: false,
                    timestamp: ts, signature: 'fake'.padEnd(128, '0'), receivedAt: Date.now(),
                });
            }
            const lowScore = computeScore(victim, new Set([alice]));
            assert.ok(lowScore >= 0 && lowScore <= 100, `Score fuera de rango: ${lowScore}`);
        });

        it('múltiples contactos directos acumulan contribuciones', () => {
            const alice = fakeId(1); const bob = fakeId(2); const target = fakeId(3);
            insertVouch(makeVouch(alice, target, VouchType.VAULT_CHUNK));
            insertVouch(makeVouch(bob, target, VouchType.VAULT_CHUNK));
            const score = computeScore(target, new Set([alice, bob]));
            const expected = Math.min(100, Math.round(50 + VOUCH_WEIGHTS[VouchType.VAULT_CHUNK] * 2));
            assert.strictEqual(score, expected);
        });
    });

    // ── Propiedades G-Set CRDT ────────────────────────────────────────────────

    describe('Propiedades G-Set CRDT', () => {
        it('merge es idempotente: insertar el mismo vouch dos veces no duplica', () => {
            const v = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE);
            insertVouch(v);
            insertVouch(v);
            const count = getVouchIds(0).filter(id => id === v.id).length;
            assert.strictEqual(count, 1, 'El vouch no debe duplicarse');
        });

        it('el conjunto solo crece (G-Set: no hay delete)', () => {
            const v1 = makeVouch(fakeId(1), fakeId(2), VouchType.HANDSHAKE);
            const v2 = makeVouch(fakeId(3), fakeId(4), VouchType.SPAM);
            insertVouch(v1);
            const before = getVouchIds(0).length;
            insertVouch(v2);
            const after = getVouchIds(0).length;
            assert.ok(after > before, 'El conjunto debe crecer');
        });

        it('el ID es determinista para el mismo evento (sin duplicados en gossip)', () => {
            const fromId = fakeId(1); const toId = fakeId(2);
            const id1 = computeVouchId(fromId, toId, VouchType.HANDSHAKE, 1700000000000);
            const id2 = computeVouchId(fromId, toId, VouchType.HANDSHAKE, 1700000000000);
            assert.strictEqual(id1, id2, 'Mismo evento → mismo ID (anti-duplicado en gossip)');
        });
    });
});
