import React from 'react';
import { Box, Typography } from '@mui/joy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SyncIcon from '@mui/icons-material/Sync';
import SecurityIcon from '@mui/icons-material/Security';
import HubIcon from '@mui/icons-material/Hub';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';

export interface PeerStat {
    host: string;
    country: string;
    latencyMs: number | null;
    score: number;
    alive: boolean;
    lat: number | null;
    lon: number | null;
}

export interface NetworkStats {
    peerCount: number;
    peers: PeerStat[];
    restartAttempts: number;
    maxRestartAttempts: number;
    selfLat: number | null;
    selfLon: number | null;
}

type StatusColor = 'success' | 'danger' | 'warning' | 'neutral';

export const STATUS_META: Record<string, { color: StatusColor; Icon: React.ElementType; title: string; spinning?: boolean }> = {
    up: { color: 'success', Icon: CheckCircleIcon, title: 'Conexión activa' },
    connecting: { color: 'neutral', Icon: SyncIcon, title: 'Preparando la red…', spinning: true },
    reconnecting: { color: 'warning', Icon: SyncIcon, title: 'Reconectando…', spinning: true },
    down: { color: 'danger', Icon: WifiOffIcon, title: 'Sin conexión' },
};

export const STATUS_SUBTITLE: Record<string, (r: number, max: number) => string> = {
    up: () => 'Tus mensajes viajan cifrados de extremo a extremo.',
    connecting: () => 'Un momento, estamos conectando tu app a la red segura.',
    reconnecting: (r, max) => r > 0 ? `Intento ${r} de ${max} para restaurar la conexión.` : 'Intentando restaurar la conexión con la red.',
    down: () => 'No hay conexión disponible. Comprueba tu conexión a Internet.',
};

export const TECH_ITEMS = [
    { Icon: SecurityIcon, accent: '#4ade80', label: 'Cifrado', value: 'ChaCha20-Poly1305 · extremo a extremo' },
    { Icon: HubIcon, accent: '#60a5fa', label: 'Protocolo', value: 'Yggdrasil · red IPv6 descentralizada' },
    { Icon: SwapHorizIcon, accent: '#a78bfa', label: 'Transporte', value: 'TCP directo entre nodos de la red' },
    { Icon: VisibilityOffIcon, accent: '#fb923c', label: 'Privacidad', value: 'Sin servidores centrales ni metadatos' },
    { Icon: TravelExploreIcon, accent: '#22d3ee', label: 'Descubrimiento', value: 'Lista pública de peers global' },
];

export const LATENCY_MAX = 500;

const latencyHex = (ms: number) =>
    ms < 100 ? '#22c55e' : ms < 250 ? '#f59e0b' : '#ef4444';

export const latencyLabel = (ms: number) =>
    ms < 100 ? 'Excelente' : ms < 250 ? 'Buena' : 'Alta';

export const latencyChipColor = (ms: number): 'success' | 'warning' | 'danger' =>
    ms < 100 ? 'success' : ms < 250 ? 'warning' : 'danger';

export const PeerRow: React.FC<{ peer: PeerStat; maxLatency: number }> = ({ peer, maxLatency }) => {
    const { host, country, latencyMs } = peer;
    const hasLatency = latencyMs !== null && latencyMs !== undefined;
    const currentMs = latencyMs ?? 0;
    const pct = hasLatency ? Math.min((currentMs / Math.max(maxLatency, LATENCY_MAX)) * 100, 100) : 0;
    const color = hasLatency ? latencyHex(currentMs) : '#6b7280';
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

export const LiveDot: React.FC<{ freshSec: number }> = ({ freshSec }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{
            width: 7,
            height: 7,
            borderRadius: 'sm',
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
