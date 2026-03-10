import React, { useEffect, useState } from 'react';
import { Box, Typography, LinearProgress, Chip } from '@mui/joy';
import RouterIcon from '@mui/icons-material/Router';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SyncIcon from '@mui/icons-material/Sync';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import WifiIcon from '@mui/icons-material/Wifi';

// ─── Tipo de estado de red exportado para App.tsx ─────────────────────────────
export type YggNetworkStatus = 'connecting' | 'up' | 'down' | 'reconnecting';

// ─── Fases del warmup inicial ─────────────────────────────────────────────────
const PHASES = [
    { label: 'Iniciando nodo P2P…', delay: 0 },
    { label: 'Seleccionando peers cercanos…', delay: 4_000 },
    { label: 'Estableciendo canales…', delay: 12_000 },
    { label: 'Sincronizando red Yggdrasil…', delay: 22_000 },
];

interface Props {
    /** Estado actual de la red Yggdrasil */
    networkStatus: YggNetworkStatus;
    /**
     * true = primera conexión (overlay bloqueante).
     * false = reconexión (banner chip no bloqueante).
     */
    isFirstConnect: boolean;
    /** Dirección IPv6 detectada */
    address?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  OVERLAY BLOQUEANTE — primer warmup
// ═══════════════════════════════════════════════════════════════════════════════
function WarmupOverlay({ networkStatus, address }: { networkStatus: YggNetworkStatus; address?: string }) {
    const [phaseIdx, setPhaseIdx] = useState(0);
    const [visible, setVisible] = useState(true);
    const [fading, setFading] = useState(false);

    const isUp = networkStatus === 'up';

    // Avanzar fases automáticamente mientras no esté listo
    useEffect(() => {
        if (isUp) return;
        const timers = PHASES.slice(1).map((p, i) =>
            window.setTimeout(() => setPhaseIdx(i + 1), p.delay)
        );
        return () => timers.forEach(clearTimeout);
    }, [isUp]);

    // Cuando llega 'up', fade-out con retardo para que el usuario lea "¡Conectado!"
    useEffect(() => {
        if (!isUp) return;
        setPhaseIdx(PHASES.length);
        const t1 = window.setTimeout(() => setFading(true), 900);
        const t2 = window.setTimeout(() => setVisible(false), 1_600);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [isUp]);

    if (!visible) return null;

    const phaseLabel = isUp
        ? '¡Conectado!'
        : (PHASES[phaseIdx]?.label ?? PHASES[PHASES.length - 1].label);

    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'background.body',
                gap: 3,
                opacity: fading ? 0 : 1,
                transition: 'opacity 0.7s ease',
                pointerEvents: fading ? 'none' : 'all',
            }}
        >
            {/* Icono animado */}
            <Box sx={{ position: 'relative', width: 80, height: 80 }}>
                {!isUp && (
                    <Box sx={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        border: '3px solid',
                        borderColor: 'primary.700',
                        borderTopColor: 'primary.400',
                        animation: 'spin 1.1s linear infinite',
                        '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                    }} />
                )}
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isUp
                        ? <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.400' }} />
                        : <RouterIcon sx={{ fontSize: 40, color: 'primary.400' }} />
                    }
                </Box>
            </Box>

            {/* Textos */}
            <Box sx={{ textAlign: 'center', px: 4 }}>
                <Typography level="h4" sx={{ fontWeight: 700, mb: 0.5, letterSpacing: '-0.3px' }}>
                    uPeer
                </Typography>
                <Typography
                    level="body-sm"
                    key={phaseLabel}
                    sx={{
                        color: isUp ? 'success.400' : 'text.secondary',
                        animation: 'fadeIn 0.4s ease',
                        '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
                    }}
                >
                    {phaseLabel}
                </Typography>

                {isUp && address && (
                    <Typography
                        level="body-xs"
                        sx={{
                            mt: 0.5,
                            color: 'text.tertiary',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            animation: 'fadeIn 0.5s ease 0.2s both',
                            '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
                        }}
                    >
                        {address}
                    </Typography>
                )}
            </Box>

            {!isUp && (
                <LinearProgress
                    variant="soft"
                    sx={{ width: 200, borderRadius: 'sm', '--LinearProgress-radius': '4px' }}
                />
            )}

            {!isUp && phaseIdx >= 3 && (
                <Typography
                    level="body-xs"
                    sx={{ color: 'text.tertiary', maxWidth: 280, textAlign: 'center', animation: 'fadeIn 0.5s ease' }}
                >
                    Buscando peers disponibles…&nbsp;
                    Puedes seguir usando la app sin red.
                </Typography>
            )}
        </Box>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BANNER CHIP — reconexiones (no bloqueante)
// ═══════════════════════════════════════════════════════════════════════════════
function ReconnectBanner({ networkStatus }: { networkStatus: YggNetworkStatus }) {
    const [visible, setVisible] = useState(false);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        let t1: number;
        let t2: number;

        if (networkStatus === 'down' || networkStatus === 'reconnecting') {
            setFading(false);
            setVisible(true);
        } else if (networkStatus === 'up') {
            // Mostrar "¡Reconectada!" brevemente y luego desaparecer
            setFading(false);
            setVisible(true);
            t1 = window.setTimeout(() => setFading(true), 1_500);
            t2 = window.setTimeout(() => setVisible(false), 2_200);
        }

        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [networkStatus]);

    if (!visible) return null;

    const chipProps: { color: 'danger' | 'warning' | 'success'; label: string; icon: React.ReactNode } =
        networkStatus === 'down'
            ? { color: 'danger', label: 'Red Yggdrasil no disponible', icon: <WifiOffIcon sx={{ fontSize: 16 }} /> }
            : networkStatus === 'reconnecting'
                ? { color: 'warning', label: 'Reconectando a Yggdrasil…', icon: <SyncIcon sx={{ fontSize: 16, animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} /> }
                : { color: 'success', label: '¡Red Yggdrasil reconectada!', icon: <WifiIcon sx={{ fontSize: 16 }} /> };

    return (
        <Box
            sx={{
                position: 'fixed',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9998,
                opacity: fading ? 0 : 1,
                transition: 'opacity 0.7s ease',
                pointerEvents: 'none',
            }}
        >
            <Chip
                color={chipProps.color}
                variant="solid"
                size="sm"
                startDecorator={chipProps.icon}
                sx={{ px: 1.5, py: 0.5, fontWeight: 600, boxShadow: 'sm' }}
            >
                {chipProps.label}
            </Chip>
        </Box>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export function YggstackSplash({ networkStatus, isFirstConnect, address }: Props) {
    if (isFirstConnect) {
        // Overlay bloqueante hasta la primera conexión exitosa
        return <WarmupOverlay networkStatus={networkStatus} address={address} />;
    }

    // Banner no bloqueante para reconexiones posteriores
    return <ReconnectBanner networkStatus={networkStatus} />;
}
