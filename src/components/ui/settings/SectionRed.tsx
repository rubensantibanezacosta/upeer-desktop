import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Divider, Typography } from '@mui/joy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SyncIcon from '@mui/icons-material/Sync';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import SecurityIcon from '@mui/icons-material/Security';
import HubIcon from '@mui/icons-material/Hub';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { CopyableField } from './shared.js';
import { NetworkMap } from './NetworkMap.js';
import type { Identity } from './types.js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PeerStat {
    host: string;
    country: string;
    latencyMs: number | null;
    score: number;
    alive: boolean;
    lat: number | null;
    lon: number | null;
}

interface NetworkStats {
    peerCount: number;
    peers: PeerStat[];
    restartAttempts: number;
    maxRestartAttempts: number;
    selfLat: number | null;
    selfLon: number | null;
}

interface Props {
    identity: Identity | null;
    networkAddress: string;
    networkStatus: string;
}

// ─── Config de estado ─────────────────────────────────────────────────────────

type StatusColor = 'success' | 'danger' | 'warning' | 'neutral';

const STATUS_META: Record<string, { color: StatusColor; Icon: React.ElementType; title: string; spinning?: boolean }> = {
    up: { color: 'success', Icon: CheckCircleIcon, title: 'Conexión activa' },
    connecting: { color: 'neutral', Icon: SyncIcon, title: 'Preparando la red…', spinning: true },
    reconnecting: { color: 'warning', Icon: SyncIcon, title: 'Reconectando…', spinning: true },
    down: { color: 'danger', Icon: WifiOffIcon, title: 'Sin conexión' },
};

const STATUS_SUBTITLE: Record<string, (r: number, max: number) => string> = {
    up: () => 'Tus mensajes viajan cifrados de extremo a extremo.',
    connecting: () => 'Un momento, estamos conectando tu app a la red segura.',
    reconnecting: (r, max) => r > 0 ? `Intento ${r} de ${max} para restaurar la conexión.` : 'Intentando restaurar la conexión con la red.',
    down: () => 'No hay conexión disponible. Comprueba tu conexión a Internet.',
};

// ─── Tech details ─────────────────────────────────────────────────────────────

const TECH_ITEMS = [
    { Icon: SecurityIcon, accent: '#4ade80', label: 'Cifrado', value: 'ChaCha20-Poly1305 · extremo a extremo' },
    { Icon: HubIcon, accent: '#60a5fa', label: 'Protocolo', value: 'Yggdrasil · red IPv6 descentralizada' },
    { Icon: SwapHorizIcon, accent: '#a78bfa', label: 'Transporte', value: 'TCP directo entre nodos de la red' },
    { Icon: VisibilityOffIcon, accent: '#fb923c', label: 'Privacidad', value: 'Sin servidores centrales ni metadatos' },
    { Icon: TravelExploreIcon, accent: '#22d3ee', label: 'Descubrimiento', value: 'Lista pública de peers global' },
];

// ─── Helpers latencia ─────────────────────────────────────────────────────────

const LATENCY_MAX = 500; // ms — normalización de la barra

const latencyHex = (ms: number) =>
    ms < 100 ? '#22c55e' : ms < 250 ? '#f59e0b' : '#ef4444';

const latencyLabel = (ms: number) =>
    ms < 100 ? 'Excelente' : ms < 250 ? 'Buena' : 'Alta';

const latencyChipColor = (ms: number): 'success' | 'warning' | 'danger' =>
    ms < 100 ? 'success' : ms < 250 ? 'warning' : 'danger';

// ─── Sub-componente: barra de latencia de un nodo ────────────────────────────

const PeerRow: React.FC<{ peer: PeerStat; maxLatency: number }> = ({ peer, maxLatency }) => {
    const { host, country, latencyMs } = peer;
    const hasLatency = latencyMs !== null;
    const pct = hasLatency ? Math.min((latencyMs! / Math.max(maxLatency, LATENCY_MAX)) * 100, 100) : 0;
    const color = hasLatency ? latencyHex(latencyMs!) : '#6b7280';

    // Host abreviado: mostrar solo los 2 últimos octetos / segmentos
    const shortHost = host.length > 22 ? host.slice(0, 10) + '…' + host.slice(-8) : host;

    return (
        <Box sx={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr 56px',
            alignItems: 'center',
            gap: 1.5,
            py: 0.75,
            px: 0.5,
            borderRadius: 'sm',
            '&:hover': { backgroundColor: 'background.level1' },
        }}>
            {/* País */}
            <Box>
                <Typography level="body-xs" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                    {country || 'Desconocido'}
                </Typography>
                <Typography
                    level="body-xs"
                    sx={{ color: 'text.tertiary', fontSize: '0.65rem', fontFamily: 'monospace', lineHeight: 1.2 }}
                >
                    {shortHost}
                </Typography>
            </Box>

            {/* Barra animada */}
            <Box sx={{
                height: 6,
                borderRadius: 'xl',
                backgroundColor: 'background.level2',
                overflow: 'hidden',
                position: 'relative',
            }}>
                <Box sx={{
                    height: '100%',
                    width: `${pct}%`,
                    backgroundColor: color,
                    borderRadius: 'xl',
                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.4s ease',
                    boxShadow: hasLatency ? `0 0 6px ${color}88` : 'none',
                }} />
            </Box>

            {/* Valor */}
            <Box sx={{ textAlign: 'right' }}>
                {hasLatency ? (
                    <Typography level="body-xs" sx={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                        {latencyMs} ms
                    </Typography>
                ) : (
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>—</Typography>
                )}
            </Box>
        </Box>
    );
};

// ─── Sub-componente: dot "en vivo" pulsante ───────────────────────────────────

const LiveDot: React.FC<{ freshSec: number }> = ({ freshSec }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: freshSec < 12 ? 'success.400' : 'neutral.400',
            animation: freshSec < 12 ? 'pulse 2s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.5, transform: 'scale(1.4)' },
            },
        }} />
        <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>
            {freshSec < 5 ? 'Ahora mismo' : `Hace ${freshSec}s`}
        </Typography>
    </Box>
);

// ─── Componente principal ─────────────────────────────────────────────────────

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
        } catch { /* silencioso */ }
    }, []);

    // Poll cada 8 s
    useEffect(() => {
        fetchStats();
        timerRef.current = setInterval(fetchStats, 8_000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [fetchStats]);

    // Reloj interno para "hace X s"
    useEffect(() => {
        const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1_000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => { if (isUp) fetchStats(); }, [isUp, fetchStats]);

    const handleRestart = async () => {
        setRestarting(true);
        try { await window.upeer.restartYggstack(); } catch { /* silencioso */ }
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

            {/* ── 1. Tarjeta de estado ─────────────────────────────────────── */}
            <Box sx={{
                mx: 1.5, mt: 2, mb: 1.5, px: 2.5, py: 2,
                borderRadius: 'lg',
                border: '1px solid',
                borderColor: `${meta.color}.outlinedBorder`,
                backgroundColor: `${meta.color}.softBg`,
                display: 'flex', alignItems: 'center', gap: 2,
            }}>
                <Box sx={{
                    width: 44, height: 44, borderRadius: '50%',
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

            {/* ── 2. Monitor de nodos en tiempo real ──────────────────────── */}
            {isUp && peers.length > 0 && (
                <>
                    <Divider sx={{ mx: 1.5, my: 0.5 }} />
                    <Box sx={{ px: 2, py: 1.5 }}>

                        {/* Cabecera: título + resumen + dot live */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <PublicIcon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                                <Typography level="body-xs" sx={{ fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                    Nodos activos · {peers.length}
                                </Typography>
                            </Box>
                            <LiveDot freshSec={freshSec} />
                        </Box>

                        {/* Resumen en chips: media + países */}
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

                        {/* Mapa geográfico de nodos */}
                        <NetworkMap
                            peers={peers}
                            selfLat={stats?.selfLat ?? null}
                            selfLon={stats?.selfLon ?? null}
                        />

                        {/* Leyenda de la barra */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '160px 1fr 56px', gap: 1.5, mb: 0.5, px: 0.5 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>Nodo</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>0 ms</Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>{LATENCY_MAX} ms</Typography>
                            </Box>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem', textAlign: 'right' }}>Latencia</Typography>
                        </Box>

                        {/* Filas de nodos */}
                        {peers.map((peer, i) => (
                            <PeerRow key={peer.host || i} peer={peer} maxLatency={maxLatency} />
                        ))}
                    </Box>
                </>
            )}

            {/* ── 3. Tu dirección de red ───────────────────────────────────── */}
            {isUp && addr && addr !== 'No detectado' && (
                <>
                    <Divider sx={{ mx: 1.5, my: 0.5 }} />
                    <Box sx={{ px: 1.5, py: 1.5 }}>
                        <CopyableField label="Tu dirección de red" value={addr} />
                    </Box>
                </>
            )}

            {/* ── 4. Cómo funciona (acordeón) ─────────────────────────────── */}
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
