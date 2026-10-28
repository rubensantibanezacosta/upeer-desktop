export type LocationErrorCategory = 'certificate' | 'admission' | 'network';

export type LocationErrorRecord = {
    at: number;
    message: string;
};

export type LocationStatusSnapshot = {
    publishedAt: number | null;
    lastSeq: number | null;
    expiresAt: number | null;
    nextRenewalAt: number | null;
    storeTargets: number;
    storeAcks: number;
    lastDhtUpdateAt: number | null;
    errors: Record<LocationErrorCategory, LocationErrorRecord | null>;
};

export const RENEWAL_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

const EMPTY_ERRORS: Record<LocationErrorCategory, LocationErrorRecord | null> = {
    certificate: null,
    admission: null,
    network: null,
};

let state: LocationStatusSnapshot = {
    publishedAt: null,
    lastSeq: null,
    expiresAt: null,
    nextRenewalAt: null,
    storeTargets: 0,
    storeAcks: 0,
    lastDhtUpdateAt: null,
    errors: { ...EMPTY_ERRORS },
};

/**
 * La auto-renovación actúa cuando faltan menos de tres días para expirar, así que ese
 * instante es el que interesa enseñar como «próxima renovación», no la caducidad.
 */
export const deriveNextRenewalAt = (expiresAt: number | null | undefined): number | null => {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
    return expiresAt - RENEWAL_THRESHOLD_MS;
};

const HEX_RUN = /\b[0-9a-f]{16,}\b/gi;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]*\b/gi;

/**
 * Los errores se muestran en la interfaz, así que se limpian de claves y direcciones
 * antes de guardarse: un mensaje de error no debe filtrar identificadores.
 */
export const sanitizeLocationError = (error: unknown): string => {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error desconocido';
    const stripped = raw
        .replace(IPV6, '[dirección]')
        .replace(HEX_RUN, '[clave]')
        .trim();
    return stripped.length > 0 ? stripped.slice(0, 200) : 'Error desconocido';
};

export const noteLocationPublished = (
    seq: number | null,
    expiresAt: number | null,
    now = Date.now(),
): void => {
    state = {
        ...state,
        publishedAt: now,
        lastSeq: typeof seq === 'number' && Number.isFinite(seq) ? seq : state.lastSeq,
        expiresAt: typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt : state.expiresAt,
        nextRenewalAt: deriveNextRenewalAt(expiresAt ?? state.expiresAt),
        errors: { ...state.errors, network: null },
    };
};

export const noteLocationStoreTargets = (count: number): void => {
    if (!Number.isFinite(count) || count <= 0) return;
    state = { ...state, storeTargets: state.storeTargets + Math.floor(count) };
};

export const noteLocationStoreAck = (): void => {
    state = { ...state, storeAcks: state.storeAcks + 1 };
};

export const noteDhtUpdateAccepted = (now = Date.now()): void => {
    state = { ...state, lastDhtUpdateAt: now };
};

export const noteLocationError = (category: LocationErrorCategory, error: unknown, now = Date.now()): void => {
    state = {
        ...state,
        errors: { ...state.errors, [category]: { at: now, message: sanitizeLocationError(error) } },
    };
};

export const getLocationStatusSnapshot = (): LocationStatusSnapshot => ({
    ...state,
    errors: { ...state.errors },
});

export const resetLocationStatus = (): void => {
    state = {
        publishedAt: null,
        lastSeq: null,
        expiresAt: null,
        nextRenewalAt: null,
        storeTargets: 0,
        storeAcks: 0,
        lastDhtUpdateAt: null,
        errors: { ...EMPTY_ERRORS },
    };
};
