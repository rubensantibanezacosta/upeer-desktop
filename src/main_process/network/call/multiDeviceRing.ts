/**
 * A qué direcciones se ofrece una llamada cuando el otro extremo es una cuenta con varios
 * dispositivos.
 *
 * Hasta ahora `sendCallOffer` mandaba la oferta a **una** dirección —la de `contact.address`, la
 * última que se guardó— así que una cuenta abierta en móvil y portátil solo sonaba en uno, elegido al
 * azar. Si ese era el que estaba apagado, la llamada no sonaba en ningún sitio y no había ningún error
 * que lo explicase.
 *
 * La decisión de producto (08/11) es la de WhatsApp/Signal con dispositivos vinculados: **suenan todos
 * a la vez y gana el que contesta antes**. Los demás reciben el final con el motivo
 * `answered-elsewhere` y dejan de sonar.
 *
 * La lógica vive aquí, aparte y sin dependencias, porque es la parte que se puede probar sin red: la
 * que decide a quién se llama, cuántas veces, y qué pasa cuando algo no responde.
 */

/** Tope de direcciones a las que se ofrece. `knownAddresses` guarda hasta 20; sonar en 20 sitios no
 * es un teléfono, es una alarma. */
export const MAX_RING_TARGETS = 4;

/**
 * Direcciones a las que se ofrece la llamada, sin repetir y con la más reciente primero.
 *
 * `knownAddresses` llega como JSON en la fila del contacto y suele traer la dirección principal
 * repetida; también puede venir corrupta de una versión anterior, así que un fallo de parseo no puede
 * tumbar una llamada: se cae a la dirección principal, que es el comportamiento de antes.
 */
export function callRingTargets(primaryAddress: string | null | undefined, knownAddresses: unknown): string[] {
    const out: string[] = [];
    const push = (value: unknown) => {
        if (typeof value !== 'string') return;
        const trimmed = value.trim();
        if (!trimmed || out.includes(trimmed)) return;
        if (out.length >= MAX_RING_TARGETS) return;
        out.push(trimmed);
    };
    let known: unknown = knownAddresses;
    if (typeof knownAddresses === 'string') {
        try {
            known = JSON.parse(knownAddresses);
        } catch {
            known = [];
        }
    }
    if (Array.isArray(known)) for (const entry of known) push(entry);
    push(primaryAddress);
    return out;
}

/**
 * Quién tiene que dejar de sonar cuando alguien contesta.
 *
 * Devuelve los demás candidatos de la misma llamada, sin el que contestó. Se comparan direcciones y no
 * identidades de usuario porque dos dispositivos de la misma cuenta comparten `upeerId`: mirar el
 * usuario daría la lista vacía siempre, que es justo el error que se quiere evitar.
 */
export function supersededRingTargets(targets: readonly string[], answeredAddress: string): string[] {
    const answered = answeredAddress.trim();
    if (!answered) return [];
    return targets.filter((target) => target !== answered);
}

/**
 * Estado de una oferta que suena en varios sitios. Cuenta las respuestas para que la primera que
 * contesta gane y las demás no se pisen.
 *
 * `busy` de un dispositivo no cierra la llamada: otro podría estar libre. Solo cierra cuando han
 * respondido todos y todos dijeron que no.
 */
export type MultiDeviceOutcome = 'pending' | 'answered' | 'all-busy' | 'all-failed';

export class MultiDeviceOffer {
    private readonly pending = new Set<string>();
    private answered: string | null = null;
    private answeredWhileRinging: string[] = [];
    private readonly busy = new Set<string>();
    private readonly failed = new Set<string>();

    constructor(targets: readonly string[]) {
        for (const target of targets) this.pending.add(target);
    }

    /** Direcciones que siguen sonando. */
    ringing(): string[] {
        return [...this.pending];
    }

    /** El que contestó, o null. */
    winner(): string | null {
        return this.answered;
    }

    /**
     * Alguien contesta. Devuelve true la primera vez; a partir de ahí false, porque la llamada ya es
     * del que ganó y el segundo no puede reescribir la sesión.
     */
    accept(address: string): boolean {
        if (this.answered !== null) return false;
        if (!this.pending.has(address)) return false;
        this.answered = address;
        // Se guarda quién estaba sonando antes de vaciar: son los que hay que callar con
        // `answered-elsewhere`, y después de vaciar ya no se sabría.
        this.answeredWhileRinging = [...this.pending].filter((target) => target !== address);
        this.pending.clear();
        return true;
    }

    /** Un dispositivo dijo estar ocupado. No cierra la oferta. */
    markBusy(address: string): void {
        if (!this.pending.delete(address)) return;
        this.busy.add(address);
    }

    /** Un dispositivo no se pudo alcanzar. */
    markFailed(address: string): void {
        if (!this.pending.delete(address)) return;
        this.failed.add(address);
    }

    /**
     * A quién hay que mandar el `answered-elsewhere` cuando alguien contestó: los que seguían sonando
     * en el momento de contestar. Vacío si nadie ha contestado todavía, porque entonces no hay nada
     * que anular.
     */
    stillRinging(): string[] {
        return this.answered === null ? [] : [...this.answeredWhileRinging];
    }

    outcome(): MultiDeviceOutcome {
        if (this.answered !== null) return 'answered';
        if (this.pending.size > 0) return 'pending';
        // Todos fallaron si ninguno llegó a decir «ocupado».
        return this.busy.size > 0 ? 'all-busy' : 'all-failed';
    }

    busyCount(): number {
        return this.busy.size;
    }

    failedCount(): number {
        return this.failed.size;
    }
}
