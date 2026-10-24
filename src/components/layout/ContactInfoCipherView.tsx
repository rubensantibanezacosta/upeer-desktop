import React, { useEffect, useState } from 'react';
import {
    Box,
    IconButton,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Typography,
} from '@mui/joy';
import LockIcon from '@mui/icons-material/Lock';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

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
        <Box sx={{ height: '60px', px: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <IconButton aria-label="Volver desde cifrado" size="sm" variant="plain" color="neutral" onClick={onBack}>
                <ArrowBackIcon />
            </IconButton>
            <Typography level="title-md" sx={{ fontWeight: 600 }}>Cifrado</Typography>
        </Box>
        <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'success.softBg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LockIcon sx={{ fontSize: 32, color: 'success.400' }} />
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
                    <Box sx={{ width: 36, height: 36, borderRadius: 'md', bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <VisibilityOffIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </Box>
                    <Box>
                        <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Nadie puede espiar</Typography>
                        <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>Ni uPeer, ni tu proveedor de internet, ni ningún intermediario puede leer tus mensajes o ver tus archivos.</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 'md', bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <LockPersonIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </Box>
                    <Box>
                        <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Solo entre vosotros dos</Typography>
                        <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>El cifrado se activa automáticamente. No tienes que hacer nada para estar protegido.</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 'md', bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <TaskAltIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
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
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 'md',
                            px: 2,
                            py: 1.5,
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
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
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
                <Box sx={{ mt: 1 }}>
                    <ListItemButton onClick={onShowSecurity} sx={{ borderRadius: 'md', py: 1.5, border: '1px solid', borderColor: 'divider' }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><LockIcon sx={{ fontSize: 20 }} /></ListItemDecorator>
                        <ListItemContent>
                            <Typography level="body-sm">Verificar identidad</Typography>
                            <Typography level="body-xs" color="neutral">Confirmar que hablas con {contactName}</Typography>
                        </ListItemContent>
                        <ChevronRightIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    </ListItemButton>
                </Box>
            )}
        </Box>
    </Box>
    );
};
