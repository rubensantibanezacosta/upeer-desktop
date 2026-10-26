import React, { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, LinearProgress, Typography } from '@mui/joy';
import { CircleCheck, MonitorSmartphone } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore.js';

const FADE_OUT_MS = 700;
const CONFIRM_MS = 900;

export const SyncBlockingOverlay: React.FC<{ enabled: boolean }> = ({ enabled }) => {
    const syncStatus = useChatStore((state) => state.syncStatus);
    const syncing = enabled && syncStatus.phase === 'syncing';
    const [visible, setVisible] = useState(false);
    const [done, setDone] = useState(false);
    const wasSyncing = useRef(false);

    useEffect(() => {
        if (syncing) {
            wasSyncing.current = true;
            setDone(false);
            setVisible(true);
            return;
        }
        if (!wasSyncing.current) return;
        wasSyncing.current = false;
        setDone(true);
        const hide = window.setTimeout(() => setVisible(false), CONFIRM_MS + FADE_OUT_MS);
        return () => window.clearTimeout(hide);
    }, [syncing]);

    if (!visible) return null;

    const progress = syncStatus.progress;
    const percent = done ? 100 : progress.percent;
    const determinate = done || progress.determinate;

    return (
        <Box
            data-testid="sync-blocking-overlay"
            role="alertdialog"
            aria-label="Sincronizando tus dispositivos"
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 9998,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'background.body',
                gap: 2.5,
                px: 3,
                opacity: done ? 0 : 1,
                transition: `opacity ${done ? FADE_OUT_MS : 220}ms ease`,
                pointerEvents: done ? 'none' : 'all',
            }}
        >
            <Box sx={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {done
                    ? <CircleCheck style={{ fontSize: 48, color: 'var(--joy-palette-success-400)' }} />
                    : <MonitorSmartphone style={{ fontSize: 40, color: 'var(--joy-palette-primary-400)' }} />}
                {!done && <CircularProgress size="lg" sx={{ position: 'absolute', inset: 0, '--CircularProgress-size': '80px', '--CircularProgress-thickness': '3px' }} />}
            </Box>
            <Box sx={{ textAlign: 'center', maxWidth: 340 }}>
                <Typography level="h4" sx={{ fontWeight: 700, mb: 0.5, letterSpacing: '-0.3px' }}>
                    uPeer
                </Typography>
                <Typography level="body-sm" sx={{ color: done ? 'success.400' : 'text.secondary' }}>
                    {done ? '¡Al día!' : progress.headline}
                </Typography>
            </Box>
            <LinearProgress
                determinate={determinate}
                value={percent}
                sx={{ width: 200, flex: 'none', borderRadius: 'sm', '--LinearProgress-radius': '4px' }}
            />
            <Typography level="body-xs" sx={{ color: 'text.tertiary', textAlign: 'center', maxWidth: 300 }}>
                {done ? 'Los chats ya están disponibles.' : `${progress.detail}. Los chats aparecerán en cuanto termine.`}
            </Typography>
        </Box>
    );
};
