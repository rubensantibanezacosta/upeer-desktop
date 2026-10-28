export const LOW_VOUCH_THRESHOLD = 40;

export type ReputationWarning = {
    label: string;
    score: number;
};

export const getReputationWarning = (score?: number | null): ReputationWarning | null => {
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    if (score >= LOW_VOUCH_THRESHOLD) return null;
    const rounded = Math.max(0, Math.round(score));
    return { label: `Reputación baja en la red (${rounded}/100). Ten cuidado.`, score: rounded };
};

export const isLowReputation = (score?: number | null): boolean => getReputationWarning(score) !== null;
