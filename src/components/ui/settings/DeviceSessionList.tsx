import React, { useEffect } from "react";
import { Box, Typography, List, ListItem, ListItemDecorator, Chip, CircularProgress, Alert, IconButton, Button, Tooltip } from "@mui/joy";
import LaptopIcon from "@mui/icons-material/Laptop";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import ShieldIcon from "@mui/icons-material/Shield";
import DeleteIcon from "@mui/icons-material/Delete";
import VerifiedIcon from "@mui/icons-material/Verified";
import DangerousIcon from "@mui/icons-material/Dangerous";
import { useDeviceStore, Device } from "../../../store/useDeviceStore.js";
import { sectionCardSx } from './shared.js';

export const DeviceSessionList: React.FC = () => {
    const { devices, isLoading, fetchDevices, setTrust, removeDevice } = useDeviceStore();

    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 15000);
        return () => clearInterval(interval);
    }, [fetchDevices]);

    const getDeviceIcon = (device: Device) => {
        const platform = device.platform?.toLowerCase() || "";
        if (platform.includes("android") || platform.includes("ios")) return <SmartphoneIcon />;
        return <LaptopIcon />;
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
        <Box sx={sectionCardSx}>
            <Box sx={{ px: 2.5, py: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                    <VerifiedIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                        Confianza local entre nodos
                    </Typography>
                </Box>
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    Nodos que este equipo ha visto en la red y si confías en ellos. Es una lista local: no forma parte del registro firmado de la cuenta.
                </Typography>
            </Box>

            <List sx={{ "--ListItem-paddingY": "0px", p: 0.5 }}>
                {devices.length === 0 && !isLoading && (
                    <Typography level="body-xs" sx={{ p: 2, textAlign: "center", opacity: 0.5 }}>
                        No hay otros dispositivos registrados.
                    </Typography>
                )}
                {devices.map((device) => (
                    <ListItem key={device.deviceId} sx={{
                        py: 1.5,
                        px: 2,
                        backgroundColor: device.isTrusted ? "transparent" : "warning.softBg"
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
                                        <VerifiedIcon sx={{ fontSize: "1rem", color: "success.main" }} />
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
                                    <DangerousIcon />
                                </IconButton>
                            )}
                            <IconButton 
                                size="sm" 
                                variant="plain" 
                                color="danger"
                                onClick={() => removeDevice(device.deviceId)}
                            >
                                <DeleteIcon />
                            </IconButton>
                        </Box>
                    </ListItem>
                ))}
            </List>

            <Box sx={{ p: 2, mt: 1 }}>
                <Alert
                    size="sm"
                    color="neutral"
                    variant="soft"
                    startDecorator={<ShieldIcon />}
                >
                    <Typography level="body-xs">
                        Toda tu actividad se sincroniza automaticamente entre estos nodos a traves de la red P2P.
                    </Typography>
                </Alert>
            </Box>
        </Box>
    );
};
