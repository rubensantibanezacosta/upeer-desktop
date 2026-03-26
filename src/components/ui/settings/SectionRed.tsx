import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Divider, Typography } from '@mui/joy';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { CopyableField } from './shared.js';
import { NetworkMap } from './NetworkMap.js';
import type { Identity } from './types.js';
import {
    LATENCY_MAX,
    LiveDot,
    PeerRow,
    STATUS_META,
    STATUS_SUBTITLE,
    TECH_ITEMS,
    latencyChipColor,
    latencyLabel,
    type NetworkStats,
} from './sectionRedSupport.js';

interface Props {
    identity: Identity | null;
    networkAddress: string;
    networkStatus: string;
}

export const SectionRed: React.FC<Props> = ({ identity, networkAddress, networkStatus }) => {
    const [stats, setStats] = useState<NetworkStats | null>(null);
    const [restarting, setRestarting] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number>(0);
    const [nowSec, setNowSec] = useState<number>(Math.floor(Date.now() / 1000));
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const addr = identity?.address || networkAddress || null;
    const isUp = networkStatus === 'up';
    const isDown = networkStatus === 'down';
    const isReconnecting = networkStatus === 'reconnecting';

    const fetchStats = useCallback(async () => {
        try {
            const s = await window.upeer.getNetworkStats();
            setStats(s);
            setLastUpdated(Math.floor(Date.now() / 1000));
        } catch {
            setStats((currentStats) => currentStats);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        timerRef.current = setInterval(fetchStats, 8_000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [fetchStats]);

    useEffect(() => {
        const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1_000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => { if (isUp) fetchStats(); }, [isUp, fetchStats]);

    const handleRestart = async () => {
        setRestarting(true);
        try {
            await window.upeer.restartYggstack();
        } catch {
            setRestarting(false);
            return;
        }
        setTimeout(() => setRestarting(false), 4_000);
    };

    const meta = STATUS_META[networkStatus] ?? STATUS_META.connecting;
    const subtitle = (STATUS_SUBTITLE[networkStatus] ?? STATUS_SUBTITLE.connecting)(
        stats?.restartAttempts ?? 0,
        stats?.maxRestartAttempts ?? 8,
    );
    const maxedOut = stats ? stats.restartAttempts >= stats.maxRestartAttempts : false;
    const showRetry = isDown || (isReconnecting && maxedOut);

    const peers = stats?.peers ?? [];
    const latencies = peers.map(p => p.latencyMs).filter((l): l is number => l !== null);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const maxLatency = latencies.length ? Math.max(...latencies) : LATENCY_MAX;
    const freshSec = lastUpdated > 0 ? nowSec - lastUpdated : 999;

    const uniqueCountries = [...new Set(peers.map(p => p.country).filter(Boolean))];

    return (
        <Box sx={{ pb: 2 }}>
            <Box sx={{
                mx: 1.5, mt: 2, mb: 1.5, px: 2.5, py: 2,
                borderRadius: 'lg',
                border: '1px solid',
                borderColor: `${meta.color}.outlinedBorder`,
                backgroundColor: `${meta.color}.softBg`,
                display: 'flex', alignItems: 'center', gap: 2,
            }}>
                <Box sx={{
                    width: 44, height: 44, borderRadius: 'md',
                    backgroundColor: `${meta.color}.softHoverBg`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    {meta.spinning
                        ? <CircularProgress size="sm" color={meta.color} thickness={3} />
                        : <meta.Icon sx={{ fontSize: 22, color: `${meta.color}.plainColor` }} />
                    }
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="title-sm" sx={{ fontWeight: 700 }}>{meta.title}</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.25 }}>{subtitle}</Typography>
                    {showRetry && (
                        <Button size="sm" variant="soft" color={isDown ? 'danger' : 'warning'}
                            loading={restarting} onClick={handleRestart} sx={{ mt: 1.5 }}>
                            Reintentar conexión
                        </Button>
                    )}
                </Box>
            </Box>

            {isUp && peers.length > 0 && (
                <>
                    <Divider sx={{ mx: 1.5, my: 0.5 }} />
                    <Box sx={{ px: 2, py: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <PublicIcon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                                <Typography level="body-xs" sx={{ fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                    Nodos activos · {peers.length}
                                </Typography>
                            </Box>
                            <LiveDot freshSec={freshSec} />
                        </Box>

                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                            {avgLatency !== null && (
                                <Chip
                                    size="sm"
                                    variant="soft"
                                    color={latencyChipColor(avgLatency)}
                                    sx={{ fontSize: '0.72rem', fontWeight: 700 }}
                                >
                                    Media: {avgLatency} ms · {latencyLabel(avgLatency)}
                                </Chip>
                            )}
                            {uniqueCountries.map(c => (
                                <Chip key={c} size="sm" variant="outlined" color="neutral" sx={{ fontSize: '0.72rem' }}>
                                    {c}
                                </Chip>
                            ))}
                        </Box>

                        <NetworkMap
                            peers={peers}
                            selfLat={stats?.selfLat ?? null}
                            selfLon={stats?.selfLon ?? null}
                        />

                        <Box sx={{ display: 'grid', gridTemplateColumns: '160px 1fr 56px', gap: 1.5, mb: 0.5, px: 0.5 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>Nodo</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>0 ms</Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>{LATENCY_MAX} ms</Typography>
                            </Box>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem', textAlign: 'right' }}>Latencia</Typography>
                        </Box>

                        {peers.map((peer, i) => (
                            <PeerRow key={peer.host || i} peer={peer} maxLatency={maxLatency} />
                        ))}
                    </Box>
                </>
            )}

            {isUp && addr && addr !== 'No detectado' && (
                <>
                    <Divider sx={{ mx: 1.5, my: 0.5 }} />
                    <Box sx={{ px: 1.5, py: 1.5 }}>
                        <CopyableField label="Tu dirección de red" value={addr} />
                    </Box>
                </>
            )}

            <Divider sx={{ mx: 1.5, my: 0.5 }} />
            <Box
                component="button"
                onClick={() => setShowDetails(v => !v)}
                sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', px: 2, py: 1.25,
                    background: 'none', border: 'none', cursor: 'pointer', color: 'text.secondary',
                    '&:hover': { backgroundColor: 'background.level1' },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LockIcon sx={{ fontSize: 15, opacity: 0.55 }} />
                    <Typography level="body-xs" sx={{ fontWeight: 600 }}>Cómo funciona la red</Typography>
                </Box>
                {showDetails ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
            </Box>

            {showDetails && (
                <Box sx={{ px: 1.5, pb: 1 }}>
                    {TECH_ITEMS.map(({ Icon, accent, label, value }) => (
                        <Box key={label} sx={{
                            display: 'flex', alignItems: 'flex-start', gap: 1.5,
                            px: 1, py: 1, borderRadius: 'sm',
                            '&:hover': { backgroundColor: 'background.level1' },
                        }}>
                            <Box sx={{
                                width: 30, height: 30, borderRadius: 'sm', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: `${accent}18`,
                            }}>
                                <Icon sx={{ fontSize: 16, color: accent }} />
                            </Box>
                            <Box>
                                <Typography level="body-xs" sx={{ fontWeight: 700 }}>{label}</Typography>
                                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>{value}</Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
};
