export type LocationErrorKey = 'certificate' | 'admission' | 'network';

export type LocationErrorEntry = { at: number; message: string } | null;

export interface LocationStatus {
    publishedAt: number | null;
    lastSeq: number | null;
    expiresAt: number | null;
    nextRenewalAt: number | null;
    storeTargets: number;
    storeAcks: number;
    lastDhtUpdateAt: number | null;
    errors: Record<LocationErrorKey, LocationErrorEntry>;
}

export const LOCATION_ERROR_LABELS: Record<LocationErrorKey, string> = {
    certificate: 'Certificado',
    admission: 'Admisión',
    network: 'Red',
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const formatElapsed = (at: number | null, now = Date.now()): string => {
    if (at === null || !Number.isFinite(at)) return 'nunca';
    const diff = Math.max(0, now - at);
    if (diff < MINUTE) return 'hace unos segundos';
    if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
    if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
    return `hace ${Math.floor(diff / DAY)} d`;
};

export const formatCountdown = (at: number | null, now = Date.now()): string => {
    if (at === null || !Number.isFinite(at)) return 'sin fecha';
    const diff = at - now;
    if (diff <= 0) return 'vencida';
    if (diff < MINUTE) return 'menos de 1 min';
    if (diff < HOUR) return `en ${Math.floor(diff / MINUTE)} min`;
    if (diff < DAY) return `en ${Math.floor(diff / HOUR)} h`;
    return `en ${Math.floor(diff / DAY)} d`;
};

export const describePublication = (status: LocationStatus | null, now = Date.now()): string => {
    if (!status || status.publishedAt === null) return 'Todavía no se ha publicado tu ubicación.';
    return `Publicada ${formatElapsed(status.publishedAt, now)} · secuencia ${status.lastSeq ?? '—'}`;
};

export const describeRenewal = (status: LocationStatus | null, now = Date.now()): string => {
    if (!status || status.expiresAt === null) return 'Sin caducidad conocida.';
    const renew = status.nextRenewalAt;
    if (renew !== null && renew <= now) return `Renovación en curso · caduca ${formatCountdown(status.expiresAt, now)}`;
    return `Se renueva ${formatCountdown(renew, now)} · caduca ${formatCountdown(status.expiresAt, now)}`;
};

export const describeStorage = (status: LocationStatus | null): string => {
    if (!status) return '—';
    if (status.storeTargets === 0) return 'Sin nodos contactados todavía.';
    return `${status.storeAcks} de ${status.storeTargets} nodos confirmaron la copia.`;
};

export const activeLocationErrors = (
    status: LocationStatus | null,
): Array<{ key: LocationErrorKey; label: string; message: string; at: number }> => {
    if (!status) return [];
    return (Object.keys(LOCATION_ERROR_LABELS) as LocationErrorKey[])
        .map((key) => {
            const entry = status.errors?.[key];
            if (!entry) return null;
            return { key, label: LOCATION_ERROR_LABELS[key], message: entry.message, at: entry.at };
        })
        .filter((entry): entry is { key: LocationErrorKey; label: string; message: string; at: number } => entry !== null);
};
