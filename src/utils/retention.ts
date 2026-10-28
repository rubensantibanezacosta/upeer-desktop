export type RetentionId = 'off' | '24h' | '7d' | '90d';

export interface RetentionPreset {
    id: RetentionId;
    label: string;
    short: string;
    ms: number;
}

const HOUR = 60 * 60 * 1000;

export const RETENTION_PRESETS: readonly RetentionPreset[] = [
    { id: 'off', label: 'Desactivados', short: 'Desactivados', ms: 0 },
    { id: '24h', label: '24 horas', short: '24 h', ms: 24 * HOUR },
    { id: '7d', label: '7 días', short: '7 días', ms: 7 * 24 * HOUR },
    { id: '90d', label: '90 días', short: '90 días', ms: 90 * 24 * HOUR },
];

export const DEFAULT_RETENTION: RetentionId = 'off';

const PRESET_BY_ID = new Map<string, RetentionPreset>(RETENTION_PRESETS.map((preset) => [preset.id, preset]));

export function resolveRetentionId(value?: string | null): RetentionId {
    if (value && PRESET_BY_ID.has(value)) {
        return value as RetentionId;
    }
    return DEFAULT_RETENTION;
}

export function retentionMs(id?: string | null): number {
    return PRESET_BY_ID.get(resolveRetentionId(id))?.ms ?? 0;
}

export function retentionLabel(id?: string | null): string {
    return PRESET_BY_ID.get(resolveRetentionId(id))?.short ?? 'Desactivados';
}

export function retentionNotice(id?: string | null): string | null {
    const preset = PRESET_BY_ID.get(resolveRetentionId(id));
    if (!preset || preset.ms === 0) return null;
    return `Los mensajes nuevos se borran a los ${preset.short}.`;
}

export function sanitizeRetentionMap(value: unknown): Record<string, RetentionId> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const result: Record<string, RetentionId> = {};
    for (const [chatId, id] of Object.entries(value as Record<string, unknown>)) {
        if (!chatId || typeof id !== 'string') continue;
        const resolved = resolveRetentionId(id);
        if (resolved === 'off' || resolved !== id) continue;
        result[chatId] = resolved;
    }

    return result;
}

export function computeExpiresAt(timestamp: number, ms: number): number | null {
    if (!Number.isFinite(timestamp) || !Number.isFinite(ms) || ms <= 0) return null;
    return Math.floor(timestamp) + Math.floor(ms);
}

export function isExpired(expiresAt: number | null | undefined, now: number): boolean {
    if (expiresAt === null || expiresAt === undefined) return false;
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
    return expiresAt <= now;
}
