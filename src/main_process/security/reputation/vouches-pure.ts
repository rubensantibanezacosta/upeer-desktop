/**
 * Lógica pura del sistema G-Set CRDT de reputación.
 * Sin dependencias de SQLite ni de módulos nativos → testeable con Node.js estándar.
 */
import crypto from 'node:crypto';

// ── VouchType ─────────────────────────────────────────────────────────────────

export enum VouchType {
    HANDSHAKE = 'handshake',       // +1.0 – conexión exitosa verificada
    VAULT_HELPED = 'vault_helped',    // +2.0 – custodió mis mensajes offline
    VAULT_RETRIEVED = 'vault_ret',     // +1.5 – entregó mensajes del vault
    VAULT_CHUNK = 'vault_chunk',     // +3.0 – custodió un shard Reed-Solomon
    SPAM = 'spam',            // −5.0 – spam detectado
    MALICIOUS = 'malicious',       // −10.0 – actividad maliciosa
    INTEGRITY_FAIL = 'integrity_fail', // −15.0 – fallo de integridad criptográfica
}

// ── Pesos y polaridad ─────────────────────────────────────────────────────────

export const VOUCH_WEIGHTS: Record<VouchType, number> = {
    [VouchType.HANDSHAKE]: 1.0,
    [VouchType.VAULT_HELPED]: 2.0,
    [VouchType.VAULT_RETRIEVED]: 1.5,
    [VouchType.VAULT_CHUNK]: 3.0,
    [VouchType.SPAM]: 5.0,
    [VouchType.MALICIOUS]: 10.0,
    [VouchType.INTEGRITY_FAIL]: 15.0,
};

export const VOUCH_POSITIVE: Record<VouchType, boolean> = {
    [VouchType.HANDSHAKE]: true,
    [VouchType.VAULT_HELPED]: true,
    [VouchType.VAULT_RETRIEVED]: true,
    [VouchType.VAULT_CHUNK]: true,
    [VouchType.SPAM]: false,
    [VouchType.MALICIOUS]: false,
    [VouchType.INTEGRITY_FAIL]: false,
};

// ── Constantes ────────────────────────────────────────────────────────────────

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Límite de vouches que contribuyen al score por emisor (anti-spam de score) */
export const MAX_CONTRIBUTING_VOUCHES_PER_SENDER = 10;
/** Máximo de IDs enviados en un REPUTATION_GOSSIP */
export const GOSSIP_MAX_IDS = 500;
/** Máximo de vouches entregados por REPUTATION_DELIVER */
export const DELIVER_MAX_VOUCHES = 50;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ReputationVouch {
    id: string;         // sha256 determinista
    fromId: string;     // upeerId del emisor
    toId: string;       // upeerId del sujeto
    type: VouchType;
    positive: boolean;
    timestamp: number;  // ms epoch
    signature: string;  // hex Ed25519
}

/** Vouch tal como se almacena en SQLite (añade receivedAt). */
export interface StoredVouch extends ReputationVouch {
    receivedAt: number;
}

// ── ID determinista ───────────────────────────────────────────────────────────

/**
 * ID determinista: mismos inputs → mismo ID (idempotencia G-Set).
 * No incluye `positive` porque viene determinado por `type`.
 */
export function computeVouchId(
    fromId: string,
    toId: string,
    type: VouchType,
    timestamp: number,
): string {
    const body = `${fromId}|${toId}|${type}|${timestamp}`;
    return crypto.createHash('sha256').update(body).digest('hex');
}

export function buildSignBody(vouch: Omit<ReputationVouch, 'signature'>): Buffer {
    return Buffer.from(
        `${vouch.id}|${vouch.fromId}|${vouch.toId}|${vouch.type}|${vouch.positive ? '1' : '0'}|${vouch.timestamp}`
    );
}

// ── Score (puro, sin DB) ──────────────────────────────────────────────────────

/**
 * Calcula el score a partir de un array de vouches ya cargados.
 * Devuelve 50 (neutral) si no hay vouches.
 *
 * Sybil-resistant: sólo contribuyen vouches de contactos directos.
 *
 * @param vouches          - Lista de StoredVouch del nodo evaluado
 * @param directContactIds - Set de upeerIds de nuestros contactos directos
 */
export function computeScorePure(
    vouches: StoredVouch[],
    directContactIds: Set<string>,
): number {
    if (vouches.length === 0) return 50;

    const bySender = new Map<string, number>();
    let delta = 0;

    for (const v of vouches) {
        if (!directContactIds.has(v.fromId)) continue;

        const used = bySender.get(v.fromId) ?? 0;
        if (used >= MAX_CONTRIBUTING_VOUCHES_PER_SENDER) continue;
        bySender.set(v.fromId, used + 1);

        const weight = VOUCH_WEIGHTS[v.type as VouchType] ?? 1.0;
        delta += weight * (v.positive ? 1 : -1);
    }

    return Math.round(Math.max(0, Math.min(100, 50 + delta)));
}
