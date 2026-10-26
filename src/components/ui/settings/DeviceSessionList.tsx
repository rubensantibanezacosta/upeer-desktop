import React, { useEffect } from "react";
import { Box, Typography, List, ListItem, ListItemDecorator, Chip, CircularProgress, IconButton, Button, Tooltip } from "@mui/joy";
import { Laptop, Smartphone, Shield, Trash2, BadgeCheck, ShieldOff } from 'lucide-react';
import { useDeviceStore, Device } from "../../../store/useDeviceStore.js";
import { CardGroupLabel } from './sectionShell.js';

export const DeviceSessionList: React.FC = () => {
    const { devices, isLoading, fetchDevices, setTrust, removeDevice } = useDeviceStore();

    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 15000);
        return () => clearInterval(interval);
    }, [fetchDevices]);

    const getDeviceIcon = (device: Device) => {
        const platform = device.platform?.toLowerCase() || "";
        if (platform.includes("android") || platform.includes("ios")) return <Smartphone style={{ fontSize: 20 }} />;
        return <Laptop style={{ fontSize: 20 }} />;
    };

    const getDeviceLabel = (device: Device) => {
        if (device.clientName) {
            return `${device.clientName} (${device.platform || "P2P Node"})`;
        }
        return `Sesion ${(device.deviceId || "").slice(0, 8)}`;
    };

    if (isLoading && devices.length === 0) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress size="md" role="progressbar" />
            </Box>
        );
    }

    return (
        <Box>
            <CardGroupLabel
                icon={<BadgeCheck style={{ fontSize: 15 }} />}
                title="Confianza local entre nodos"
                description="Nodos que este equipo ha visto en la red y si confías en ellos. Es una lista local: no forma parte del registro firmado de la cuenta."
            />

            <List sx={{ "--ListItem-paddingY": "0px", p: 0.5 }}>
                {devices.length === 0 && !isLoading && (
                    <Typography level="body-xs" sx={{ p: 2, textAlign: "center", opacity: 0.5 }}>
                        No hay otros dispositivos registrados.
                    </Typography>
                )}
                {devices.map((device) => (
                    <ListItem key={device.deviceId} sx={{
                        py: 1.25,
                        px: 1.25,
                        borderRadius: '10px',
                        mb: 0.5,
                        transition: 'background-color 0.15s ease',
                        '&:hover': { backgroundColor: 'background.level2' },
                    }}>
                        <ListItemDecorator sx={{ color: device.isTrusted ? "primary.main" : "warning.main" }}>
                            {getDeviceIcon(device)}
                        </ListItemDecorator>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography level="title-sm" noWrap>
                                    {getDeviceLabel(device)}
                                </Typography>
                                {device.isTrusted ? (
                                    <Tooltip title="Dispositivo de confianza">
                                        <BadgeCheck style={{ fontSize: 16, color: 'var(--joy-palette-success-500)' }} />
                                    </Tooltip>
                                ) : (
                                    <Chip size="sm" color="warning" variant="soft" sx={{ fontSize: "0.65rem" }}>No verificado</Chip>
                                )}
                            </Box>
                            <Typography level="body-xs" sx={{ fontFamily: "monospace", mt: 0.25, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis" }}>
                                ID: {device.deviceId}
                            </Typography>
                        </Box>
                        
                        <Box sx={{ display: "flex", gap: 1, ml: 1 }}>
                            {!device.isTrusted && (
                                <Button 
                                    size="sm" 
                                    variant="soft" 
                                    color="success"
                                    onClick={() => setTrust(device.deviceId, true)}
                                >
                                    Confiar
                                </Button>
                            )}
                            {device.isTrusted && (
                                <IconButton 
                                    size="sm" 
                                    variant="plain" 
                                    color="neutral"
                                    onClick={() => setTrust(device.deviceId, false)}
                                >
                                    <ShieldOff style={{ fontSize: 18 }} />
                                </IconButton>
                            )}
                            <IconButton 
                                size="sm" 
                                variant="plain" 
                                color="danger"
                                onClick={() => removeDevice(device.deviceId)}
                            >
                                <Trash2 style={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>
                    </ListItem>
                ))}
            </List>

            <Box sx={{ px: 0.5, pb: 1, display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                <Shield style={{ fontSize: 16, color: 'var(--joy-palette-text-tertiary)', marginTop: 2, flexShrink: 0 }} />
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Toda tu actividad se sincroniza automaticamente entre estos nodos a traves de la red P2P.
                </Typography>
            </Box>
        </Box>
    );
};
