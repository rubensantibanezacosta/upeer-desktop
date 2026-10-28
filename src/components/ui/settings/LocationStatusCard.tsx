import React, { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Typography } from '@mui/joy';
import { AlertTriangle, Clock, Database, MapPin, RefreshCw } from 'lucide-react';
import { SettingsCard, CardGroupLabel } from './sectionShell.js';
import {
    activeLocationErrors,
    describePublication,
    describeRenewal,
    describeStorage,
    formatElapsed,
    type LocationStatus,
} from './locationStatusSupport.js';

const REFRESH_MS = 15_000;

const Row: React.FC<{ Icon: React.ElementType; label: string; value: string }> = ({ Icon, label, value }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 0.5, py: 0.75 }}>
        <Icon style={{ fontSize: 14, opacity: 0.55, marginTop: 2, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
            <Typography level="body-xs" sx={{ fontWeight: 700 }}>{label}</Typography>
            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>{value}</Typography>
        </Box>
    </Box>
);

export const LocationStatusCard: React.FC = () => {
    const [status, setStatus] = useState<LocationStatus | null>(null);
    const [now, setNow] = useState<number>(Date.now());
    const [available, setAvailable] = useState<boolean>(true);

    const fetchStatus = useCallback(async () => {
        try {
            const next = await window.upeer.getLocationStatus();
            setStatus(next);
            setAvailable(true);
        } catch {
            setAvailable(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const poll = setInterval(fetchStatus, REFRESH_MS);
        const tick = setInterval(() => setNow(Date.now()), 1_000);
        return () => {
            clearInterval(poll);
            clearInterval(tick);
        };
    }, [fetchStatus]);

    if (!available) return null;

    const errors = activeLocationErrors(status);
    const hasAck = (status?.storeAcks ?? 0) > 0;

    return (
        <SettingsCard>
            <CardGroupLabel
                icon={<MapPin style={{ fontSize: 14 }} />}
                title="Tu ubicación en la red"
                action={(
                    <Chip size="sm" variant="soft" color={hasAck ? 'success' : 'neutral'} sx={{ fontSize: '0.68rem' }}>
                        {hasAck ? 'Publicada' : 'Pendiente'}
                    </Chip>
                )}
            />
            <Box sx={{ px: 0.5, pb: 1 }}>
                <Row Icon={Clock} label="Última publicación" value={describePublication(status, now)} />
                <Row Icon={RefreshCw} label="Renovación automática" value={describeRenewal(status, now)} />
                <Row Icon={Database} label="Copias en la red" value={describeStorage(status)} />
                <Row
                    Icon={MapPin}
                    label="Última actualización recibida"
                    value={status?.lastDhtUpdateAt ? formatElapsed(status.lastDhtUpdateAt, now) : 'ninguna todavía'}
                />
                {errors.map((entry) => (
                    <Box key={entry.key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 0.5, py: 0.75 }}>
                        <AlertTriangle style={{ fontSize: 14, color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography level="body-xs" sx={{ fontWeight: 700 }}>{entry.label}</Typography>
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                {entry.message} · {formatElapsed(entry.at, now)}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>
        </SettingsCard>
    );
};
