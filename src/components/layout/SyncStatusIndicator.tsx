import React from 'react';
import { Box, Tooltip, Typography } from '@mui/joy';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useChatStore } from '../../store/useChatStore.js';

const stateLabel = (state: UpeerSyncStatus['state']): string => (
    state === 'synced' ? 'Sincronizado' : state === 'pending' ? 'Sincronizando' : 'Sin otros dispositivos'
);

const peerLabel = (peer: UpeerSyncPeerState): string => (
    `${peer.deviceId.slice(0, 8)} · ${peer.state === 'synced' ? 'sincronizado' : 'pendiente'}`
);

const SyncStatusTooltip: React.FC<{ status: UpeerSyncStatus }> = ({ status }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, maxWidth: 260 }}>
        <Typography level="body-sm" sx={{ fontWeight: 600 }}>{stateLabel(status.state)}</Typography>
        {status.peers.length === 0 && (
            <Typography level="body-xs">Este es el único dispositivo de la cuenta.</Typography>
        )}
        {status.peers.map((peer) => (
            <Typography key={peer.deviceId} level="body-xs">{peerLabel(peer)}</Typography>
        ))}
        {status.pendingEvents > 0 && (
            <Typography level="body-xs">{status.pendingEvents} evento(s) sin confirmar</Typography>
        )}
        <Typography level="body-xs" sx={{ opacity: 0.7, mt: 0.5 }}>Pulsa para gestionar los dispositivos</Typography>
    </Box>
);

export const SyncStatusIndicator: React.FC<{ onOpenDevices?: () => void }> = ({ onOpenDevices }) => {
    const syncStatus = useChatStore((state) => state.syncStatus);
    const Icon = syncStatus.state === 'synced'
        ? CloudDoneIcon
        : syncStatus.state === 'pending' ? CloudUploadIcon : CloudOffIcon;
    const color = syncStatus.state === 'synced'
        ? 'success.500'
        : syncStatus.state === 'pending' ? 'warning.500' : 'text.tertiary';
    return (
        <Tooltip placement="right" variant="soft" title={<SyncStatusTooltip status={syncStatus} />}>
            <Box
                role="status"
                aria-label={`Estado de sincronización: ${stateLabel(syncStatus.state)}`}
                onClick={onOpenDevices}
                sx={{ display: 'flex', justifyContent: 'center', color, cursor: onOpenDevices ? 'pointer' : 'default' }}
            >
                <Icon sx={{ fontSize: 20 }} />
            </Box>
        </Tooltip>
    );
};
