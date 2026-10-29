import React from 'react';
import { Box, Chip, IconButton, LinearProgress, Tooltip, Typography } from '@mui/joy';
import { Info, ShieldAlert, ShieldCheck } from 'lucide-react';

import { CardGroupLabel } from './sectionShell.js';
import { getReputationWarning, LOW_VOUCH_THRESHOLD } from '../../../utils/reputationWarning.js';

export type ReputationData = {
    vouchScore: number;
    connectionCount: number;
};

export const DEFAULT_REPUTATION: ReputationData = {
    vouchScore: 50,
    connectionCount: 0,
};

const reputationBadge = (myReputation: ReputationData | null): React.ReactNode => {
    const warning = getReputationWarning(myReputation?.vouchScore);
    if (!warning) return undefined;
    return (
        <Chip size="sm" color="danger" variant="soft" startDecorator={<ShieldAlert style={{ fontSize: 12 }} />} sx={{ fontSize: '11px' }}>
            Baja
        </Chip>
    );
};

interface ReputationSectionProps {
    myReputation: ReputationData | null;
    onToggleInfo: () => void;
}

export const ReputationSection: React.FC<ReputationSectionProps> = ({ myReputation, onToggleInfo }) => {
    const warning = getReputationWarning(myReputation?.vouchScore);
    const connectionCount = myReputation?.connectionCount ?? 0;
    const score = myReputation === null ? null : Math.max(0, Math.min(100, Math.round(myReputation.vouchScore)));
    const low = score !== null && score < LOW_VOUCH_THRESHOLD;
    return (
        <Box>
            <CardGroupLabel
                icon={<ShieldCheck style={{ fontSize: 15 }} />}
                title="Reputación"
                badge={reputationBadge(myReputation)}
                action={
                    <Tooltip title="¿Qué es la reputación?" variant="soft" size="sm">
                        <IconButton size="sm" variant="plain" color="neutral" onClick={onToggleInfo}><Info style={{ fontSize: 16 }} /></IconButton>
                    </Tooltip>
                }
            />
            <Box sx={{ px: 0.5, pb: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {warning ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'danger.500' }}>
                        <ShieldAlert style={{ fontSize: 14 }} />
                        <Typography level="body-xs" sx={{ fontWeight: 600 }}>{warning.label}</Typography>
                    </Box>
                ) : null}
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                    <Typography level="h3" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: low ? 'danger.500' : 'text.primary' }}>
                        {score === null ? '—' : score}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>de 100</Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {score === null ? 'Cargando…' : `${connectionCount} ${connectionCount === 1 ? 'contacto directo' : 'contactos directos'}`}
                    </Typography>
                </Box>
                <LinearProgress
                    determinate
                    value={score ?? 0}
                    size="sm"
                    color={low ? 'danger' : 'primary'}
                    sx={{ borderRadius: 'sm' }}
                />
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                    Se calcula con los avales que te dan tus contactos directos en los últimos 30 días.
                </Typography>
            </Box>
        </Box>
    );
};
