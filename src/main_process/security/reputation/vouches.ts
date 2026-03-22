import { info, warn, error, debug } from '../secure-logger.js';
import {
    insertVouch,
    vouchExists,
    getVouchIds as dbGetVouchIds,
    getVouchesByIds,
    getVouchesForNode,
    countRecentVouchesByFrom,
} from '../../storage/reputation/operations.js';
import {
    VouchType,
    VOUCH_WEIGHTS,
    VOUCH_POSITIVE,
    THIRTY_DAYS_MS,
    ONE_DAY_MS,
    GOSSIP_MAX_IDS,
    DELIVER_MAX_VOUCHES,
    computeVouchId,
    computeScorePure,
    buildSignBody,
    type ReputationVouch,
    type StoredVouch,
} from './vouches-pure.js';

export {
    VouchType,
    VOUCH_WEIGHTS,
    VOUCH_POSITIVE,
    GOSSIP_MAX_IDS,
    DELIVER_MAX_VOUCHES,
    computeVouchId,
    type ReputationVouch,
    type StoredVouch,
};

// ── Constantes locales ────────────────────────────────────────────────────────
/** Límite de vouches almacenados por emisor por día (anti-flood en DB) */
const MAX_VOUCHES_PER_SENDER_PER_DAY = 200;

// ── Emisión ───────────────────────────────────────────────────────────────────

/**
 * Emite y persiste un vouch firmado sobre `toId`.
 * Devuelve el vouch para gossipiarlo de inmediato, o null si falla.
 */
export async function issueVouch(
    toId: string,
    type: VouchType,
): Promise<ReputationVouch | null> {
    try {
        const { getMyUPeerId, sign } = await import('../identity.js');
        const fromId = getMyUPeerId();
        if (!fromId) return null;

        const timestamp = type === VouchType.HANDSHAKE
            ? Math.floor(Date.now() / ONE_DAY_MS) * ONE_DAY_MS
            : Date.now();
        const positive = VOUCH_POSITIVE[type];
        const id = computeVouchId(fromId, toId, type, timestamp);

        // Idempotente: no re-emitir el mismo evento
        if (vouchExists(id)) return null;

        const vouchBody: Omit<ReputationVouch, 'signature'> = {
            id, fromId, toId, type, positive, timestamp,
        };

        const signature = sign(buildSignBody(vouchBody)).toString('hex');
        const vouch: ReputationVouch = { ...vouchBody, signature };

        insertVouch({ ...vouch, receivedAt: timestamp });
        info('Vouch emitido', { fromId, toId, type, positive }, 'reputation');
        return vouch;
    } catch (e) {
        error('issueVouch falló', e, 'reputation');
        return null;
    }
}

// ── Recepción (gossip) ────────────────────────────────────────────────────────

/**
 * Valida y persiste un vouch recibido vía gossip.
 * Verifica ID determinista + firma Ed25519 del emisor.
 * Solo acepta vouches de contactos cuya clave pública conocemos.
 */
export async function saveIncomingVouch(vouch: ReputationVouch): Promise<boolean> {
    try {
        // 1. Idempotente: ya lo tenemos
        if (vouchExists(vouch.id)) return true;

        // 2. Campos obligatorios
        if (!vouch.id || !vouch.fromId || !vouch.toId || !vouch.type || !vouch.signature) {
            warn('Vouch malformado', { id: vouch.id }, 'reputation');
            return false;
        }

        // 3. Tipo válido
        if (!Object.values(VouchType).includes(vouch.type as VouchType)) {
            warn('Tipo de vouch desconocido', { type: vouch.type }, 'reputation');
            return false;
        }

        // 4. Verificar ID determinista
        const expectedId = computeVouchId(vouch.fromId, vouch.toId, vouch.type as VouchType, vouch.timestamp);
        if (expectedId !== vouch.id) {
            warn('ID de vouch no coincide', { expected: expectedId, received: vouch.id }, 'reputation');
            return false;
        }

        // 5. Ventana temporal: no más de 5 min en el futuro, no más de 30 días en el pasado
        const now = Date.now();
        if (vouch.timestamp > now + 5 * 60 * 1000) {
            warn('Timestamp de vouch en el futuro', { id: vouch.id }, 'reputation');
            return false;
        }
        if (vouch.timestamp < now - THIRTY_DAYS_MS) {
            warn('Vouch demasiado antiguo', { id: vouch.id }, 'reputation');
            return false;
        }

        // 6. Rate limit: máx MAX_VOUCHES_PER_SENDER_PER_DAY por emisor por día
        const dayAgo = now - ONE_DAY_MS;
        const todayCount = countRecentVouchesByFrom(vouch.fromId, dayAgo);
        if (todayCount >= MAX_VOUCHES_PER_SENDER_PER_DAY) {
            debug('Rate limit de vouch excedido', { fromId: vouch.fromId }, 'reputation');
            return false;
        }

        // 7. Verificar firma con la clave pública del emisor (sólo contactos conocidos)
        const { verify } = await import('../identity.js');
        const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
        const contact = await getContactByUpeerId(vouch.fromId);
        if (!contact?.publicKey) {
            warn('Vouch de contacto desconocido ignorado', { fromId: vouch.fromId }, 'reputation');
            return false;
        }

        const positive = VOUCH_POSITIVE[vouch.type as VouchType];
        const isValid = verify(
            buildSignBody({ ...vouch, positive }),
            Buffer.from(vouch.signature, 'hex'),
            Buffer.from(contact.publicKey, 'hex'),
        );

        if (!isValid) {
            warn('Firma de vouch inválida', { fromId: vouch.fromId, id: vouch.id }, 'reputation');
            return false;
        }

        // 8. Persistir
        insertVouch({ ...vouch, positive, receivedAt: now });
        return true;
    } catch (e) {
        error('saveIncomingVouch falló', e, 'reputation');
        return false;
    }
}

// ── Score ─────────────────────────────────────────────────────────────────────

/**
 * Calcula el score cargando vouches de la DB y delegando en computeScorePure.
 * Sybil-resistant: sólo contribuyen vouches de contactos directos.
 *
 * @param toId             - upeerId del nodo a evaluar
 * @param directContactIds - Set de upeerIds de nuestros contactos directos
 */
export function computeScore(
    toId: string,
    directContactIds: Set<string>,
): number {
    try {
        const since = Date.now() - THIRTY_DAYS_MS;
        const vouches = getVouchesForNode(toId, since);
        return computeScorePure(vouches as StoredVouch[], directContactIds);
    } catch {
        return 50;
    }
}

/**
 * Versión conveniente que obtiene los contactos directos desde la DB.
 */
export async function getVouchScore(toId: string): Promise<number> {
    try {
        const { getContacts } = await import('../../storage/contacts/operations.js');
        const contacts = getContacts() as any[];
        const directContactIds = new Set<string>(
            contacts
                .filter((c: any) => c.status === 'connected' && c.upeerId)
                .map((c: any) => c.upeerId as string),
        );
        return computeScore(toId, directContactIds);
    } catch {
        return 50;
    }
}

// ── Helpers de gossip ─────────────────────────────────────────────────────────

/** IDs a compartir durante el gossip (últimos 30 días, máx GOSSIP_MAX_IDS). */
export function getGossipIds(): string[] {
    const since = Date.now() - THIRTY_DAYS_MS;
    return dbGetVouchIds(since).slice(0, GOSSIP_MAX_IDS);
}

/** Vouches completos para entregar, limitados a DELIVER_MAX_VOUCHES. */
export function getVouchesForDelivery(ids: string[]): ReputationVouch[] {
    return getVouchesByIds(ids.slice(0, DELIVER_MAX_VOUCHES)) as unknown as ReputationVouch[];
}
