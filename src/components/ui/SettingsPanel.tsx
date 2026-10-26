import React, { useState } from 'react';
import {
    Box,
    Typography,
    Avatar,
    List,
    ListItem,
    ListItemButton,
    ListItemDecorator,
} from '@mui/joy';

import { CircleUser, Lock, Bell, Palette, Shield, HardDrive, Info, Network, MonitorSmartphone, LogOut } from 'lucide-react';

import { SettingsPanelProps, SettingsSection } from './settings/types.js';
import { listRowAvatarSx, listRowButtonSx, listRowDecoratorSx, listRowListItemSx, LIST_ROW_MIN_HEIGHT } from '../layout/listRowMetrics.js';
import { SectionPerfil } from './settings/SectionPerfil.js';
import { SectionSeguridad } from './settings/SectionSeguridad.js';
import { SectionPrivacidad } from './settings/SectionPrivacidad.js';
import { SectionNotificaciones } from './settings/SectionNotificaciones.js';
import { SectionApariencia } from './settings/SectionApariencia.js';
import { SectionAlmacenamiento } from './settings/SectionAlmacenamiento.js';
import { SectionRed } from './settings/SectionRed.js';
import { SectionAcerca } from './settings/SectionAcerca.js';
import { SectionDispositivos } from './settings/SectionDispositivos.js';
import { SignOutFlow } from './settings/SignOutFlow.js';

// ─── Definicion de secciones ─────────────────────────────────────────────────

const SECTIONS: { id: SettingsSection; label: string; desc: string; icon: React.ReactNode }[] = [
    { id: 'perfil', label: 'Perfil', desc: 'Nombre, foto, dirección de contacto', icon: <CircleUser /> },
    { id: 'dispositivos', label: 'Dispositivos', desc: 'Añadir y revisar los de tu cuenta', icon: <MonitorSmartphone /> },
    { id: 'privacidad', label: 'Privacidad', desc: 'Confirmaciones, estado de conexión', icon: <Lock /> },
    { id: 'seguridad', label: 'Seguridad', desc: 'Palabras clave, protección de cuenta', icon: <Shield /> },
    { id: 'notificaciones', label: 'Notificaciones', desc: 'Mensajes, solicitudes, sonidos', icon: <Bell /> },
    { id: 'apariencia', label: 'Apariencia', desc: 'Tema y tamaño de texto', icon: <Palette /> },
    { id: 'almacenamiento', label: 'Almacenamiento', desc: 'Mensajes guardados y archivos', icon: <HardDrive /> },
    { id: 'red', label: 'Conexión', desc: 'Estado y dirección de red', icon: <Network /> },
    { id: 'acerca', label: 'Acerca de', desc: 'Versión y licencia', icon: <Info /> },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    identity,
    networkAddress,
    networkStatus,
    activeSection,
    onSectionChange,
    onClose: _onClose,
    onIdentityUpdate,
}) => {
    const active = activeSection;
    const setActive = onSectionChange;
    const [signOutOpen, setSignOutOpen] = useState(false);

    const renderSection = () => {
        switch (active) {
            case 'perfil': return <SectionPerfil identity={identity} networkAddress={networkAddress} onIdentityUpdate={onIdentityUpdate} />;
            case 'dispositivos': return <SectionDispositivos />;
            case 'privacidad': return <SectionPrivacidad />;
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
                    height: LIST_ROW_MIN_HEIGHT, boxSizing: 'border-box',
                }}>
                    <Typography level="h4" sx={{ fontWeight: 600 }}>Ajustes</Typography>
                </Box>

                {/* Lista de secciones */}
                                <List sx={{ '--ListItem-paddingY': '0px', p: 0.5, flexGrow: 1 }}>
                    {SECTIONS.map((s) => (
                                        <ListItem key={s.id} sx={listRowListItemSx}>
                            <ListItemButton
                                selected={active === s.id}
                                onClick={() => setActive(s.id)}
                                                sx={listRowButtonSx}
                            >
                                                <ListItemDecorator sx={listRowDecoratorSx}>
                                    {s.id === 'perfil' ? (
                                        <Avatar
                                            size="lg"
                                            src={identity?.avatar || undefined}
                                            color={active === s.id ? 'primary' : 'neutral'}
                                            variant="soft"
                                                            sx={listRowAvatarSx}
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
                                    <ListItem sx={listRowListItemSx}>
                                        <ListItemButton
                                            onClick={() => setSignOutOpen(true)}
                                            sx={listRowButtonSx}
                                        >
                                            <ListItemDecorator sx={listRowDecoratorSx}>
                                                <Box sx={{
                                                    width: 40, height: 40,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'danger.500',
                                                }}>
                                                    <LogOut style={{ fontSize: 18 }} />
                                                </Box>
                                            </ListItemDecorator>
                                            <Box>
                                                <Typography level="body-md" sx={{ fontWeight: 500, color: 'danger.500' }}>Cerrar sesión</Typography>
                                                <Typography level="body-sm" color="neutral">Borra tus datos de este dispositivo</Typography>
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

            <SignOutFlow open={signOutOpen} onClose={() => setSignOutOpen(false)} />
        </Box>
    );
};
