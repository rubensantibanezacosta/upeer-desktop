/**
 * Qué hacer con una llamada cuando el otro extremo no está conectado.
 *
 * Hasta ahora, marcar a alguien que está offline dejaba la llamada muda: la `CALL_OFFER` se intentaba
 * entregar a una dirección que no responde, el timbre caducaba a los 30 s y **no quedaba rastro en
 * ningún sitio** — ni fila en el historial ni nada en el vault. Al volver, el otro no sabía que le
 * habían llamado. El chat y los ficheros sí encolan en el vault para entrega en la reconexión; las
 * llamadas no lo hacían.
 *
 * Esto decide, sin tocar la red ni la base, si una llamada hay que dejarla en el buzón y con qué
 * forma, para poder probarlo.
 */

/** Un aviso de llamada perdida no tiene sentido eterno: si llega dos días tarde, molesta. */
export const MISSED_CALL_VAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Prioridad en el vault. El chat normal es 1 y el control 3; una llamada perdida va en medio. */
export const MISSED_CALL_VAULT_PRIORITY = 2;

export type CallDeliveryDecision =
    | { kind: 'delivered' }
    | { kind: 'queue-missed' }
    | { kind: 'drop' };

/**
 * Decide qué hacer con una llamada saliente según si se pudo entregar y si llegó a conectar.
 *
 * - **Entregada y conectada**: no hay nada que encolar, la llamada ocurrió.
 * - **No entregada** (nadie contestó la oferta, porque el otro está offline): se deja un aviso de
 *   llamada perdida en el vault, para que lo vea al volver.
 * - **Entregada pero no conectada** (sonó y no contestó, o se rechazó): el otro ya se enteró, no hace
 *   falta buzón. Reencolar aquí duplicaría el aviso.
 */
export function decideCallDelivery(delivered: boolean, connected: boolean): CallDeliveryDecision {
    if (connected) return { kind: 'delivered' };
    if (delivered) return { kind: 'drop' };
    return { kind: 'queue-missed' };
}

export type MissedCallNotice = {
    type: 'CALL_MISSED';
    callId: string;
    kind: 'audio' | 'video';
    /** Marca de tiempo del intento, para que la fila del historial no diga «ahora» cuando llegue. */
    timestamp: number;
};

/**
 * El paquete que se guarda en el vault.
 *
 * Deliberadamente **no** es la `CALL_OFFER` original: una oferta que llegue horas después sonaría el
 * teléfono del otro sin que haya nadie al otro lado. Lo que se guarda es el hecho de que le llamaron,
 * que es lo que de verdad sirve al reconectarse.
 */
export function missedCallNotice(callId: string, kind: 'audio' | 'video', timestamp: number): MissedCallNotice {
    return { type: 'CALL_MISSED', callId, kind, timestamp };
}

/**
 * Clave del buzón: una por llamada, para que reenviar el mismo aviso no cree dos entradas y el
 * receptor pueda deduplicar por `callId`.
 */
export function missedCallPayloadId(callId: string): string {
    return `call-missed:${callId}`;
}
