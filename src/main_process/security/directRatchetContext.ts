/**
 * Contexto del Double Ratchet para el chat directo.
 *
 * La sesión DR se indexa por `(upeerId, contextId)`, y `upeerId` es **la cuenta**. Una
 * cuenta puede tener varios dispositivos (escritorio, móvil, portátil), y todos ellos
 * mantienen conversaciones con la misma cuenta del otro lado. Con un único contexto
 * `'direct'` los tres dispositivos comparten una sola sesión: cada mensaje encadena el
 * ratchet del anterior, así que en cuanto dos dispositivos escriben, el estado se
 * desincroniza y uno de los dos deja de descifrar. El "escribiendo" seguía llegando
 * porque no pasa por el ratchet.
 *
 * El sync ya lo hace bien (`sync:${deviceId}`); esto es lo mismo para el chat. Cuando el
 * contacto no tiene dispositivo conocido se mantiene `'direct'`, que es el contexto
 * histórico, para no invalidar sesiones ya establecidas con implementaciones antiguas.
 */
const DIRECT = 'direct';

export type DirectRatchetContext = typeof DIRECT | `direct:${string}`;

/**
 * Contexto para hablar con un contacto por chat directo.
 *
 * @param deviceId dispositivo del contacto con el que se cifra, si se conoce.
 */
export function directRatchetContext(deviceId?: string | null): DirectRatchetContext {
    const normalized = typeof deviceId === 'string' ? deviceId.trim().toLowerCase() : '';
    return normalized ? `direct:${normalized}` : DIRECT;
}

/** Contextos aceptados al descifrar: el histórico y el nuevo por dispositivo. */
export function isDirectRatchetContext(value: string): boolean {
    return value === DIRECT || value.startsWith('direct:');
}

/**
 * Contextos que se deben probar al descifrar, del más específico al más antiguo.
 *
 * Se prueba primero el contexto del dispositivo emisor (si el paquete lo trae) y luego
 * `'direct'`, para que una sesión establecida antes de este cambio se siga pudiendo leer.
 */
export function directRatchetContextCandidates(senderDeviceId?: string | null): string[] {
    const specific = directRatchetContext(senderDeviceId);
    return specific === DIRECT ? [DIRECT] : [specific, DIRECT];
}
