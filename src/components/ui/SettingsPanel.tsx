import React from 'react';
import {
    Box,
    Typography,
    Avatar,
    List,
    ListItem,
    ListItemButton,
    ListItemDecorator,
} from '@mui/joy';

import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockIcon from '@mui/icons-material/Lock';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PaletteIcon from '@mui/icons-material/Palette';
import ShieldIcon from '@mui/icons-material/Shield';
import StorageIcon from '@mui/icons-material/Storage';
import InfoIcon from '@mui/icons-material/Info';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import LogoutIcon from '@mui/icons-material/Logout';
import BlockIcon from '@mui/icons-material/Block';

import { SettingsPanelProps, SettingsSection } from './settings/types.js';
import { SectionPerfil } from './settings/SectionPerfil.js';
import { SectionSeguridad } from './settings/SectionSeguridad.js';
import { SectionPrivacidad } from './settings/SectionPrivacidad.js';
import { SectionNotificaciones } from './settings/SectionNotificaciones.js';
import { SectionApariencia } from './settings/SectionApariencia.js';
import { SectionAlmacenamiento } from './settings/SectionAlmacenamiento.js';
import { SectionRed } from './settings/SectionRed.js';
import { SectionAcerca } from './settings/SectionAcerca.js';
import { SectionBloqueados } from './settings/SectionBloqueados.js';

// ─── Definicion de secciones ─────────────────────────────────────────────────

const SECTIONS: { id: SettingsSection; label: string; desc: string; icon: React.ReactNode }[] = [
    { id: 'perfil', label: 'Perfil', desc: 'Nombre, foto, dirección de contacto', icon: <AccountCircleIcon /> },
    { id: 'privacidad', label: 'Privacidad', desc: 'Confirmaciones, estado de conexión', icon: <LockIcon /> },
    { id: 'bloqueados', label: 'Bloqueados', desc: 'Usuarios que no pueden contactarte', icon: <BlockIcon /> },
    { id: 'seguridad', label: 'Seguridad', desc: 'Palabras clave, protección de cuenta', icon: <ShieldIcon /> },
    { id: 'notificaciones', label: 'Notificaciones', desc: 'Mensajes, solicitudes, sonidos', icon: <NotificationsIcon /> },
    { id: 'apariencia', label: 'Apariencia', desc: 'Tema y tamaño de texto', icon: <PaletteIcon /> },
    { id: 'almacenamiento', label: 'Almacenamiento', desc: 'Mensajes guardados y archivos', icon: <StorageIcon /> },
    { id: 'red', label: 'Conexión', desc: 'Estado y dirección de red', icon: <NetworkCheckIcon /> },
    { id: 'acerca', label: 'Acerca de', desc: 'Versión y licencia', icon: <InfoIcon /> },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    identity,
    networkAddress,
    networkStatus,
    activeSection,
    onSectionChange,
    onClose,
    onLockSession,
    onIdentityUpdate,
}) => {
    const active = activeSection;
    const setActive = onSectionChange;
    const activeItem = SECTIONS.find(s => s.id === active);

    const renderSection = () => {
        switch (active) {
            case 'perfil': return <SectionPerfil identity={identity} networkAddress={networkAddress} onIdentityUpdate={onIdentityUpdate} />;
            case 'privacidad': return <SectionPrivacidad />;
            case 'bloqueados': return <SectionBloqueados />;
            case 'seguridad': return <SectionSeguridad />;
            case 'notificaciones': return <SectionNotificaciones />;
            case 'apariencia': return <SectionApariencia />;
            case 'almacenamiento': return <SectionAlmacenamiento />;
            case 'red': return <SectionRed identity={identity} networkAddress={networkAddress} networkStatus={networkStatus} />;
            case 'acerca': return <SectionAcerca />;
            default: return null;
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>

            {/* ── Columna izquierda ──────────────────────────────────── */}
            <Box sx={{
                width: 400, minWidth: 400, flexShrink: 0,
                borderRight: '1px solid', borderColor: 'divider',
                display: 'flex', flexDirection: 'column',
                backgroundColor: 'background.surface',
                overflowY: 'auto',
            }}>
                {/* Header */}
                <Box sx={{
                    p: 2, display: 'flex', alignItems: 'center',
                    backgroundColor: 'background.surface',
                    height: '60px', boxSizing: 'border-box',
                }}>
                    <Typography level="h4" sx={{ fontWeight: 600 }}>Ajustes</Typography>
                </Box>

                {/* Lista de secciones */}
                <List sx={{ '--ListItem-paddingY': '0px', p: 0, flexGrow: 1 }}>
                    {SECTIONS.map((s) => (
                        <ListItem key={s.id} sx={{ p: 0 }}>
                            <ListItemButton
                                selected={active === s.id}
                                onClick={() => setActive(s.id)}
                                sx={{ height: '72px', px: 1.5, borderRadius: 0, margin: 0 }}
                            >
                                <ListItemDecorator sx={{ mr: 2 }}>
                                    {s.id === 'perfil' ? (
                                        <Avatar
                                            size="lg"
                                            src={identity?.avatar || undefined}
                                            color={active === s.id ? 'primary' : 'neutral'}
                                            variant="soft"
                                        >
                                            {!identity?.avatar && s.icon}
                                        </Avatar>
                                    ) : (
                                        <Box sx={{
                                            width: 40, height: 40,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: active === s.id ? 'primary.500' : 'text.secondary',
                                        }}>
                                            {s.icon}
                                        </Box>
                                    )}
                                </ListItemDecorator>
                                <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                                    <Typography level="body-md" sx={{ fontWeight: 500 }}>{s.label}</Typography>
                                    <Typography level="body-sm" color="neutral" noWrap>{s.desc}</Typography>
                                </Box>
                            </ListItemButton>
                        </ListItem>
                    ))}

                    {/* Cerrar sesión */}
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton
                            onClick={async () => {
                                await window.upeer.lockSession();
                                onLockSession?.();
                            }}
                            sx={{ height: '72px', px: 1.5, borderRadius: 0, margin: 0 }}
                        >
                            <ListItemDecorator sx={{ mr: 2 }}>
                                <Box sx={{
                                    width: 40, height: 40,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'danger.500',
                                }}>
                                    <LogoutIcon />
                                </Box>
                            </ListItemDecorator>
                            <Box>
                                <Typography level="body-md" sx={{ fontWeight: 500, color: 'danger.500' }}>Cerrar sesión</Typography>
                                <Typography level="body-sm" color="neutral">Salir de tu cuenta en este dispositivo</Typography>
                            </Box>
                        </ListItemButton>
                    </ListItem>
                </List>
            </Box>

            {/* ── Columna derecha — detalle ──────────────────────────── */}
            <Box sx={{
                flexGrow: 1,
                display: 'flex', flexDirection: 'column',
                overflowY: 'auto',
                backgroundColor: 'background.body',
            }}>
                {active ? (
                    <>
                        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                            {renderSection()}
                        </Box>
                    </>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Typography level="body-md" color="neutral">Selecciona una opcion</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
