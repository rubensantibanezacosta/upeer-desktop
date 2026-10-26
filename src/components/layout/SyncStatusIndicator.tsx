import React from 'react';
import { Badge, Box, Tooltip, Typography } from '@mui/joy';
import { MonitorSmartphone } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore.js';

const deviceLabel = (device: UpeerSyncDevice): string => (
    device.state === 'local' ? 'Este dispositivo'
        : device.state === 'synced' ? 'Conectado'
            : device.state === 'pending' ? 'Sincronizando'
                : 'Sin conexión'
);

const deviceColor = (device: UpeerSyncDevice): string => (
    device.state === 'synced' || device.state === 'local'
        ? 'success.500'
        : device.state === 'pending' ? 'warning.500' : 'text.tertiary'
);

const platformLabel = (platform: string): string => (
    platform === 'android' || platform === 'ios' ? 'Móvil' : 'Escritorio'
);

const SyncStatusTooltip: React.FC<{ status: UpeerSyncStatus; total: number }> = ({ status, total }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, maxWidth: 300 }}>
        <Typography level="body-sm" sx={{ fontWeight: 600 }}>
            {total === 1 ? 'Este es el único dispositivo de tu cuenta' : `${total} dispositivos en tu cuenta`}
        </Typography>
        {(status.devices ?? []).map((device) => (
            <Box key={device.deviceId} sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: deviceColor(device), flex: '0 0 auto' }} />
                <Typography level="body-xs">
                    {platformLabel(device.platform)} · {device.deviceId.slice(0, 8)} · {deviceLabel(device)}
                </Typography>
            </Box>
        ))}
        {status.pendingEvents > 0 && (
            <Typography level="body-xs">{status.pendingEvents} evento(s) sin confirmar</Typography>
        )}
        <Typography level="body-xs" sx={{ opacity: 0.7, mt: 0.5 }}>Pulsa para gestionar los dispositivos</Typography>
    </Box>
);

export const SyncStatusIndicator: React.FC<{ onOpenDevices?: () => void; active?: boolean }> = ({ onOpenDevices, active = false }) => {
    const syncStatus = useChatStore((state) => state.syncStatus);
    const devices = syncStatus.devices ?? [];
    const total = devices.length;
    const online = devices.filter((device) => device.state === 'synced' || device.state === 'local').length;
    const color = online > 1
        ? 'var(--joy-palette-success-500)'
        : online === 1
            ? 'var(--joy-palette-warning-500)'
            : 'var(--joy-palette-text-tertiary)';
    const label = total === 0
        ? 'Sin dispositivos en la cuenta'
        : `${total} dispositivo${total === 1 ? '' : 's'} en tu cuenta, ${online} conectado${online === 1 ? '' : 's'}`;
    return (
        <Tooltip placement="right" variant="soft" title={<SyncStatusTooltip status={syncStatus} total={total} />}>
            <Box
                role="status"
                aria-label={label}
                onClick={onOpenDevices}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    cursor: onOpenDevices ? 'pointer' : 'default',
                    backgroundColor: active ? 'primary.softBg' : 'transparent',
                    transition: 'background-color 0.15s ease',
                    '&:hover': onOpenDevices ? { backgroundColor: active ? 'primary.softActiveBg' : 'background.level2' } : undefined,
                }}
            >
                <Badge
                    badgeContent={total}
                    invisible={total < 1}
                    color={online > 1 ? 'success' : 'warning'}
                    size="sm"
                    sx={{ '& .MuiBadge-badge': { top: 2, right: 2, fontSize: '10px', minWidth: 16, height: 16, px: 0.4 } }}
                >
                    <MonitorSmartphone style={{ fontSize: 20, color }} />
                </Badge>
            </Box>
        </Tooltip>
    );
};
