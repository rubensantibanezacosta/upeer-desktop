import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Avatar, Button } from '@mui/joy';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BlockIcon from '@mui/icons-material/Block';
import { QRCodeSVG } from 'qrcode.react';
import { useChatStore } from '../../store/useChatStore.js';

interface ContactCardProps {
    name: string;
    address: string;
    upeerId: string;
    isMe: boolean;
    avatar?: string;
}

const YGG_PREFIX_RE = /^[23][0-9a-f]{2}:/i;

const normalizeYggdrasilAddress = (addr: string): string => {
    if (!addr) return addr;
    const parts = addr.split(':');
    if (parts.length === 7 && !YGG_PREFIX_RE.test(addr)) {
        return '200:' + addr;
    }
    return addr;
};

export const ContactCard: React.FC<ContactCardProps> = ({ name, address, upeerId, isMe, avatar }) => {
    const normalizedAddress = normalizeYggdrasilAddress(address);
    const fullIdentity = `${upeerId}@${normalizedAddress}`;
    const contacts = useChatStore((state) => state.contacts);
    const myIdentity = useChatStore((state) => state.myIdentity);
    const refreshContacts = useChatStore((state) => state.refreshContacts);
    const setTargetUpeerId = useChatStore((state) => state.setTargetUpeerId);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [didSave, setDidSave] = useState(false);

    const existingContact = useMemo(
        () => contacts.find((contact) => contact.upeerId === upeerId && !contact.isConversationOnly),
        [contacts, upeerId]
    );
    const isSelfContact = myIdentity?.upeerId === upeerId;
    const existingStatus = existingContact?.status;
    const isBlockedContact = existingStatus === 'blocked';
    const isPendingContact = existingStatus === 'pending' || existingStatus === 'incoming';
    const isSavedContact = !!existingContact && !isBlockedContact;
    const isActionDisabled = isSaving || isSelfContact || isBlockedContact || isPendingContact || isSavedContact || didSave;

    useEffect(() => {
        setIsSaving(false);
        setSaveError(null);
        setDidSave(false);
    }, [fullIdentity]);

    const buttonLabel = (() => {
        if (isSaving) return 'Guardando...';
        if (isSelfContact) return 'Eres tú';
        if (isBlockedContact) return 'Contacto bloqueado';
        if (isPendingContact) return 'Solicitud pendiente';
        if (isSavedContact || didSave) return 'Ya guardado';
        return 'Guardar contacto';
    })();

    const buttonIcon = (() => {
        if (isSelfContact || isSavedContact || didSave) return <HowToRegIcon />;
        if (isBlockedContact) return <BlockIcon />;
        if (isPendingContact) return <AccessTimeIcon />;
        return <PersonAddIcon />;
    })();

    const handleSaveContact = async () => {
        if (isActionDisabled) return;

        setIsSaving(true);
        setSaveError(null);

        try {
            const result = await window.upeer.addContact(fullIdentity, name);

            if (!result.success) {
                setSaveError(result.error ?? 'No se pudo guardar el contacto.');
                return;
            }

            setDidSave(true);
            await refreshContacts();

            if (result.upeerId) {
                setTargetUpeerId(result.upeerId);
            }
        } catch {
            setSaveError('No se pudo guardar el contacto.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Box sx={{ p: 1.25, borderRadius: 'md', bgcolor: isMe ? 'rgba(255,255,255,0.08)' : 'background.level1' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Avatar size="lg" src={avatar} sx={{ fontWeight: 700, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'primary.100', color: isMe ? 'white' : 'primary.600', borderRadius: 'md' }}>
                    {(name?.[0] ?? '?').toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                    <Typography level="title-sm" noWrap>{name}</Typography>
                    <Typography level="body-xs" sx={{ opacity: 0.7 }} noWrap>Tarjeta de contacto</Typography>
                </Box>
            </Box>
            <Box sx={{ backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', p: 1.25, borderRadius: 'md', mb: 1.25 }}>
                <Typography level="body-xs" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.9 }}>
                    {fullIdentity}
                </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.25 }}>
                <Box sx={{ p: 2, borderRadius: 'md', backgroundColor: '#ffffff', display: 'inline-flex', boxShadow: 'sm' }}>
                    <QRCodeSVG value={fullIdentity} size={180} level="M" includeMargin={false} />
                </Box>
            </Box>
            <Button
                size="sm"
                variant="outlined"
                color="neutral"
                fullWidth
                startDecorator={buttonIcon}
                onClick={() => void handleSaveContact()}
                disabled={isActionDisabled}
                sx={{
                    fontWeight: 600,
                    borderColor: isMe ? 'rgba(255,255,255,0.28)' : 'divider',
                    color: isMe ? 'white' : 'text.primary',
                    '&:hover': {
                        borderColor: isMe ? 'rgba(255,255,255,0.4)' : 'neutral.outlinedBorder',
                        backgroundColor: isMe ? 'rgba(255,255,255,0.08)' : 'background.level2',
                    },
                    '&.Mui-disabled': {
                        color: isMe ? 'rgba(255,255,255,0.6)' : 'text.tertiary',
                        borderColor: isMe ? 'rgba(255,255,255,0.15)' : 'divider',
                        backgroundColor: isMe ? 'rgba(255, 255, 255, 0.05)' : 'background.level1',
                    }
                }}
            >
                {buttonLabel}
            </Button>
            {saveError ? (
                <Typography level="body-xs" color="danger" sx={{ mt: 0.75 }}>
                    {saveError}
                </Typography>
            ) : null}
        </Box>
    );
};
