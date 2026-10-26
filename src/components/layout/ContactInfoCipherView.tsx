import React, { useEffect, useState } from 'react';
import {
    Box,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Typography,
} from '@mui/joy';
import { Lock, ChevronRight, ArrowLeft, EyeOff, Users, CircleCheck, Copy } from 'lucide-react';
import { rowButtonSx, rowIconSx, rowsSx } from './infoPanelRows.js';

interface ContactInfoCipherViewProps {
    contactName: string;
    upeerId: string;
    onBack: () => void;
    onShowSecurity?: () => void;
}

export const ContactInfoCipherView: React.FC<ContactInfoCipherViewProps> = ({ contactName, upeerId, onBack, onShowSecurity }) => {
    const [security, setSecurity] = useState<{ hasSession: boolean; hasContactKey: boolean; safetyNumber: string } | null>(null);
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

    useEffect(() => {
        let active = true;
        window.upeer.getContactSecurity(upeerId)
            .then((result) => { if (active) setSecurity(result); })
            .catch(() => { if (active) setSecurity({ hasSession: false, hasContactKey: false, safetyNumber: '' }); });
        return () => { active = false; };
    }, [upeerId]);

    const copySafetyNumber = async () => {
        if (!security?.safetyNumber) return;
        const result = await window.upeer.writeClipboardText(security.safetyNumber);
        setCopyState(result.success ? 'copied' : 'failed');
    };

    return (
    <Box sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.surface',
        zIndex: 10,
    }}>
        <Box sx={{ height: '60px', px: 2, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <IconButton aria-label="Volver desde cifrado" size="sm" variant="plain" color="neutral" onClick={onBack}>
                <ArrowLeft style={{ fontSize: 20 }} />
            </IconButton>
            <Typography level="title-md" sx={{ fontWeight: 600 }}>Cifrado</Typography>
        </Box>
        <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
                <Box sx={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'success.400' }}>
                    <Lock style={{ fontSize: 32 }} />
                </Box>
                <Typography level="title-md" sx={{ fontWeight: 700 }}>
                    Los mensajes están protegidos
                </Typography>
                <Typography level="body-sm" color="neutral" sx={{ lineHeight: 1.65 }}>
                    Todo lo que escribes a <b>{contactName}</b> se convierte en un código secreto antes de salir de tu dispositivo. Solo el teléfono o PC de {contactName} sabe descifrarlo.
                </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.tertiary', pt: 0.25 }}>
                        <EyeOff style={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                        <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Nadie puede espiar</Typography>
                        <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>Ni uPeer, ni tu proveedor de internet, ni ningún intermediario puede leer tus mensajes o ver tus archivos.</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.tertiary', pt: 0.25 }}>
                        <Users style={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                        <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Solo entre vosotros dos</Typography>
                        <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>El cifrado se activa automáticamente. No tienes que hacer nada para estar protegido.</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.tertiary', pt: 0.25 }}>
                        <CircleCheck style={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                        <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Puedes comprobarlo</Typography>
                        <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>Compara el número de seguridad con {contactName} por otro canal para descartar un impostor.</Typography>
                    </Box>
                </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography level="body-xs" sx={{ fontWeight: 600 }}>Número de seguridad</Typography>
                {security?.safetyNumber ? (
                    <>
                        <Box sx={{
                            backgroundColor: 'background.level1',
                            borderRadius: 'md',
                            px: 1.5,
                            py: 1.25,
                            fontFamily: 'monospace',
                            fontSize: 14,
                            letterSpacing: '0.06em',
                            wordBreak: 'break-all',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                        }}>
                            <Box component="span" sx={{ flex: 1 }}>{security.safetyNumber}</Box>
                            <IconButton aria-label="Copiar número de seguridad" size="sm" variant="plain" color="neutral" onClick={copySafetyNumber}>
                                <Copy style={{ fontSize: 16 }} />
                            </IconButton>
                        </Box>
                        <Typography level="body-xs" color="neutral">
                            {copyState === 'copied' ? 'Número copiado' : copyState === 'failed' ? 'No se pudo copiar' : 'Ambos dispositivos calculan el mismo número. Si coincide, no hay nadie en medio.'}
                        </Typography>
                    </>
                ) : (
                    <Typography level="body-xs" color="neutral">
                        {!security ? 'Leyendo la sesión cifrada…' : security.hasContactKey ? 'No se pudo calcular el número en este dispositivo.' : 'Todavía no hay clave del contacto para comparar.'}
                    </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: security?.hasSession ? 'success.400' : 'neutral.500' }} />
                    <Typography level="body-xs" color="neutral">
                        {security?.hasSession ? 'Sesión de doble ratchet activa' : 'Sin sesión establecida todavía'}
                    </Typography>
                </Box>
            </Box>
            {onShowSecurity && (
                <List sx={{ ...rowsSx, mx: -2, px: 0 }}>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton onClick={onShowSecurity} sx={rowButtonSx}>
                            <ListItemDecorator sx={{ color: 'inherit' }}>
                                <Box sx={rowIconSx}><Lock style={{ fontSize: 20 }} /></Box>
                            </ListItemDecorator>
                            <ListItemContent>
                                <Typography level="body-sm">Verificar identidad</Typography>
                                <Typography level="body-xs" color="neutral">Confirmar que hablas con {contactName}</Typography>
                            </ListItemContent>
                            <ChevronRight style={{ fontSize: 18, color: 'var(--joy-palette-text-tertiary)' }} />
                        </ListItemButton>
                    </ListItem>
                </List>
            )}
        </Box>
    </Box>
    );
};
