import React, { useEffect, useState } from 'react';
import { Box, Typography, List, ListItem, ListItemDecorator, Chip, CircularProgress, Alert } from '@mui/joy';
import LaptopIcon from '@mui/icons-material/Laptop';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ShieldIcon from '@mui/icons-material/Shield';

interface Device {
    deviceId: string;
    isCurrent: boolean;
    lastSeen: number;
    address: string;
    metadata?: {
        clientName?: string;
        clientVersion?: string;
        platform?: string;
        deviceClass?: 'desktop' | 'mobile' | 'tablet' | 'web';
    };
}

export const DeviceSessionList: React.FC = () => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const res = await window.upeer.getMyDevices();
                setDevices(res || []);
            } catch (err) {
                console.error('Failed to fetch devices:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDevices();
        const interval = setInterval(fetchDevices, 10000);
        return () => clearInterval(interval);
    }, []);

    const getDeviceIcon = (device: Device) => {
        const deviceClass = device.metadata?.deviceClass;
        if (deviceClass === 'mobile' || deviceClass === 'tablet') return <SmartphoneIcon />;
        const id = device.deviceId.toLowerCase();
        if (id.includes('mobile') || id.includes('android') || id.includes('ios')) return <SmartphoneIcon />;
        return <LaptopIcon />;
    };

    const getDeviceLabel = (device: Device) => {
        if (device.isCurrent) return 'Este dispositivo';
        if (device.metadata?.clientName) {
            return `${device.metadata.clientName} (${device.metadata.platform || 'P2P Node'})`;
        }
        return `Sesión ${(device.deviceId || '').slice(0, 8)}`;
    };

    if (loading && devices.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size="sm" />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ px: 1.5, py: 1, mt: 1 }}>
                <Typography level="title-sm" sx={{ mb: 0.5 }}>Sesiones Activas</Typography>
                <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 1.5 }}>
                    Otros dispositivos que usan tu identidad y reciben tus mensajes.
                </Typography>
            </Box>

            <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                {devices.map((device) => (
                    <ListItem key={device.deviceId} sx={{
                        py: 1.5,
                        px: 2,
                        borderTop: devices.indexOf(device) > 0 ? '1px solid' : 'none',
                        borderColor: 'divider'
                    }}>
                        <ListItemDecorator sx={{ color: device.isCurrent ? 'primary.main' : 'neutral.500' }}>
                            {getDeviceIcon(device)}
                        </ListItemDecorator>
                        <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography level="title-sm">
                                    {getDeviceLabel(device)}
                                </Typography>
                                {device.isCurrent && <Chip size="sm" color="primary" variant="soft" sx={{ fontSize: '0.65rem' }}>Actual</Chip>}
                                {device.metadata?.clientVersion && (
                                    <Typography level="body-xs" sx={{ ml: 'auto', opacity: 0.5 }}>
                                        v{device.metadata.clientVersion}
                                    </Typography>
                                )}
                            </Box>
                            <Typography level="body-xs" sx={{ fontFamily: 'monospace', mt: 0.25, opacity: 0.7 }}>
                                {(device.address || '').slice(0, 24)}...
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                                <FiberManualRecordIcon sx={{ fontSize: 8, color: 'success.500' }} />
                                <Typography level="body-xs" sx={{ fontWeight: 600 }}>En línea</Typography>
                            </Box>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.65rem' }}>
                                Activo ahora
                            </Typography>
                        </Box>
                    </ListItem>
                ))}
            </List>

            <Box sx={{ px: 1.5, py: 1.5, mt: 1 }}>
                <Alert
                    variant="soft"
                    color="neutral"
                    size="sm"
                    startDecorator={<ShieldIcon sx={{ fontSize: 16 }} />}
                    sx={{ '--Alert-padding': '8px' }}
                >
                    <Typography level="body-xs">
                        Toda tu actividad se sincroniza automáticamente entre estos nodos a través de la red P2P.
                    </Typography>
                </Alert>
            </Box>
        </Box>
    );
};
