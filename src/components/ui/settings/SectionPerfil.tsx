import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    Typography,
    Avatar,
    Stack,
    IconButton,
    Button,
    Input,
    Tooltip,
    LinearProgress,
    Chip,
    Divider,
    Modal,
    ModalDialog,
    ModalClose,
} from '@mui/joy';

import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import SecurityIcon from '@mui/icons-material/Security';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DoneIcon from '@mui/icons-material/Done';

import { QRCodeSVG } from 'qrcode.react';

import { Identity } from './types.js';
import { CopyableField, resizeImageToDataUrl } from './shared.js';
import {
    ReputacionModalContent,
    AlmacenamientoModalContent,
    DireccionContactoModalContent,
    IdContactoModalContent,
    ClaveVerificacionModalContent,
    DireccionRedModalContent,
} from './InfoModal.js';

interface Props {
    identity: Identity | null;
    networkAddress: string;
    onIdentityUpdate?: () => void;
}

type ReputationData = {
    vouchScore: number;
    connectionCount: number;
};

type InfoKey = 'reputacion' | 'almacenamiento' | 'direccion' | 'id' | 'clave' | 'red';

const DEFAULT_REPUTATION: ReputationData = {
    vouchScore: 50, connectionCount: 0,
};

export const SectionPerfil: React.FC<Props> = ({ identity, networkAddress, onIdentityUpdate }) => {
    const [alias, setAlias] = useState(identity?.alias || '');
    const [avatar, setAvatar] = useState(identity?.avatar || '');
    const [isEditingAlias, setIsEditingAlias] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [myReputation, setMyReputation] = useState<ReputationData | null>(null);
    const [vaultStats, setVaultStats] = useState<{ count: number; sizeBytes: number } | null>(null);
    const [activeInfo, setActiveInfo] = useState<InfoKey | null>(null);
    const [showQR, setShowQR] = useState(false);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleInfo = (key: InfoKey) =>
        setActiveInfo(prev => prev === key ? null : key);

    const addr = identity?.address || networkAddress || '';
    const fullId = identity ? `${identity.upeerId}@${addr}` : '';
    const displayName = alias || identity?.upeerId || 'Mi cuenta';

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(fullId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [fullId]);

    useEffect(() => {
        if (identity?.alias != null) setAlias(identity.alias);
        if (identity?.avatar != null) setAvatar(identity.avatar);
    }, [identity?.alias, identity?.avatar]);

    useEffect(() => {
        if (window.upeer.getMyReputation) {
            window.upeer.getMyReputation()
                .then((r: any) => {
                    if (r && typeof r.vouchScore === 'number') {
                        setMyReputation({ vouchScore: r.vouchScore, connectionCount: r.connectionCount ?? 0 });
                    } else {
                        setMyReputation(DEFAULT_REPUTATION);
                    }
                })
                .catch(() => setMyReputation(DEFAULT_REPUTATION));
        } else {
            setMyReputation(DEFAULT_REPUTATION);
        }
        window.upeer.getVaultStats?.().then(setVaultStats).catch(() => { });
    }, []);

    const handleAvatarClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await resizeImageToDataUrl(file);
            setAvatar(dataUrl);
            await window.upeer.setMyAvatar(dataUrl);
            onIdentityUpdate?.();
        } catch (err) {
            console.error('Error al cambiar avatar:', err);
        }
        e.target.value = '';
    };

    const saveAlias = useCallback(async () => {
        const trimmed = alias.trim();
        setIsSaving(true);
        try {
            await window.upeer.setMyAlias(trimmed);
            onIdentityUpdate?.();
        } finally {
            setIsSaving(false);
            setIsEditingAlias(false);
        }
    }, [alias, onIdentityUpdate]);

    const fmtBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>

            {/* ── Avatar + alias ─────────────────────────────────────── */}
            <Box sx={{
                px: 2.5, py: 3,
                display: 'flex', alignItems: 'center', gap: 3,
                borderBottom: '1px solid', borderColor: 'divider',
                backgroundColor: 'background.surface',
            }}>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

                <Tooltip title="Cambiar foto de perfil" variant="soft" size="sm">
                    <Box onClick={handleAvatarClick} sx={{
                        width: 96, height: 96, borderRadius: 'lg',
                        overflow: 'hidden', flexShrink: 0, cursor: 'pointer', position: 'relative',
                        '&:hover .avatar-overlay': { opacity: 1 },
                    }}>
                        {avatar
                            ? <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <Avatar sx={{ width: '100%', height: '100%', fontSize: '2.5rem', borderRadius: 'lg' }}>
                                {displayName.charAt(0).toUpperCase()}
                            </Avatar>
                        }
                        <Box className="avatar-overlay" sx={{
                            position: 'absolute', inset: 0, borderRadius: 'lg',
                            backgroundColor: 'rgba(0,0,0,0.48)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0, transition: 'opacity 0.18s',
                        }}>
                            <EditIcon sx={{ color: 'white', fontSize: '24px' }} />
                        </Box>
                    </Box>
                </Tooltip>

                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography level="body-xs" sx={{ fontWeight: 600, mb: 0.5, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Nombre
                    </Typography>
                    {isEditingAlias ? (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Input
                                autoFocus size="md" value={alias}
                                onChange={(e) => setAlias(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveAlias(); if (e.key === 'Escape') setIsEditingAlias(false); }}
                                placeholder="Escribe tu nombre..." sx={{ flexGrow: 1 }}
                            />
                            <IconButton size="sm" color="success" disabled={isSaving} onClick={saveAlias}><CheckIcon /></IconButton>
                        </Stack>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', mb: 0.5 }} onClick={() => setIsEditingAlias(true)}>
                            {alias
                                ? <Typography level="h4" sx={{ fontWeight: 600 }}>{alias}</Typography>
                                : <Typography level="h4" sx={{ fontStyle: 'italic', opacity: 0.4, fontWeight: 400 }}>Sin nombre</Typography>
                            }
                            <EditIcon sx={{ fontSize: '15px', opacity: 0.35 }} />
                        </Box>
                    )}
                    <Typography level="body-xs" color="neutral" noWrap sx={{ fontFamily: 'monospace', opacity: 0.45 }}>
                        {identity?.upeerId ? identity.upeerId.slice(0, 24) + '…' : '—'}
                    </Typography>
                </Box>
            </Box>

            {/* ── Reputacion + Almacenamiento (2 columnas) ───────────── */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid', borderColor: 'divider' }}>

                {/* Reputacion */}
                <Box sx={{ px: 2.5, py: 2.5, borderRight: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <SecurityIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                            <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                                Reputacion
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {myReputation && (() => {
                                const { vouchScore, connectionCount } = myReputation;
                                const isNew = vouchScore === 50 && connectionCount === 0;
                                let color: 'success' | 'primary' | 'neutral' | 'danger' = 'neutral';
                                let icon = <SecurityIcon sx={{ fontSize: '12px' }} />;
                                let label = isNew ? 'Sin historial' : 'Estándar';
                                if (!isNew) {
                                    if (vouchScore >= 80) { color = 'success'; icon = <VerifiedUserIcon sx={{ fontSize: '12px' }} />; label = 'Alta'; }
                                    else if (vouchScore >= 65) { color = 'primary'; icon = <CheckCircleIcon sx={{ fontSize: '12px' }} />; label = 'Buena'; }
                                    else if (vouchScore < 40) { color = 'danger'; icon = <GppMaybeIcon sx={{ fontSize: '12px' }} />; label = 'Baja'; }
                                }
                                return <Chip size="sm" color={color} variant="soft" startDecorator={icon} sx={{ fontSize: '11px' }}>{label}</Chip>;
                            })()}
                            <Tooltip title="¿Qué es la reputación?" variant="soft" size="sm">
                                <IconButton size="sm" variant="plain" color="neutral" onClick={() => toggleInfo('reputacion')}>
                                    <InfoOutlinedIcon sx={{ fontSize: '16px' }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {myReputation ? (() => {
                        const { vouchScore, connectionCount } = myReputation;
                        const barColor = vouchScore >= 80 ? 'success' : vouchScore >= 65 ? 'primary' : vouchScore < 40 ? 'danger' : 'neutral';
                        return (
                            <>
                                <LinearProgress determinate value={vouchScore} size="sm" color={barColor} sx={{ mb: 2, borderRadius: 'sm' }} />
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                    {[
                                        { label: 'Vouches', value: `${vouchScore}/100` },
                                        { label: 'Contactos', value: String(connectionCount) },
                                    ].map(({ label, value }) => (
                                        <Box key={label}>
                                            <Typography level="body-xs" sx={{ opacity: 0.45, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</Typography>
                                            <Typography level="body-sm" sx={{ fontWeight: 600 }}>{value}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </>
                        );
                    })() : (
                        <Typography level="body-xs" sx={{ opacity: 0.4 }}>Cargando...</Typography>
                    )}
                </Box>

                {/* Almacenamiento cedido */}
                <Box sx={{ px: 2.5, py: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <CloudDoneIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                            <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                                Almac. cedido
                            </Typography>
                        </Box>
                        <Tooltip title="¿Qué es el almacenamiento cedido?" variant="soft" size="sm">
                            <IconButton size="sm" variant="plain" color="neutral" onClick={() => toggleInfo('almacenamiento')}>
                                <InfoOutlinedIcon sx={{ fontSize: '16px' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    {vaultStats !== null ? (() => {
                        const pct = Math.min((vaultStats.sizeBytes / (1024 * 1024 * 1024)) * 100, 100);
                        return (
                            <>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>{fmtBytes(vaultStats.sizeBytes)}</Typography>
                                    <Typography level="body-xs" sx={{ opacity: 0.4 }}>/ 1 GB</Typography>
                                </Box>
                                <LinearProgress determinate value={pct} size="sm" color="neutral" sx={{ mb: 1.5, borderRadius: 'sm' }} />
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                    <Box>
                                        <Typography level="body-xs" sx={{ opacity: 0.45, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mensajes</Typography>
                                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>{vaultStats.count}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography level="body-xs" sx={{ opacity: 0.45, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Uso</Typography>
                                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>{pct.toFixed(1)}%</Typography>
                                    </Box>
                                </Box>
                            </>
                        );
                    })() : (
                        <Typography level="body-xs" sx={{ opacity: 0.4 }}>Cargando...</Typography>
                    )}
                </Box>
            </Box>

            {/* ── Panel info: Reputacion ─────────────────────────────── */}

            {/* ── Direccion de contacto ──────────────────────────────── */}
            <Box sx={{ px: 2.5, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <FingerprintIcon sx={{ fontSize: '16px', opacity: 0.45 }} />
                    <Typography level="body-sm" sx={{ fontWeight: 600, flexGrow: 1 }}>Tu dirección de contacto</Typography>
                    <Tooltip title="¿Qué es esto?" variant="soft" size="sm">
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => toggleInfo('direccion')}>
                            <InfoOutlinedIcon sx={{ fontSize: '16px' }} />
                        </IconButton>
                    </Tooltip>
                </Box>
                <CopyableField label="Comparte esta dirección para que puedan escribirte" value={fullId} />
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                    <Button
                        variant="outlined" color="neutral" size="sm"
                        startDecorator={<QrCode2Icon sx={{ fontSize: '15px' }} />}
                        onClick={() => setShowQR(true)}
                    >
                        Mostrar QR
                    </Button>
                    <Button
                        variant={copied ? 'soft' : 'outlined'}
                        color={copied ? 'success' : 'neutral'}
                        size="sm"
                        startDecorator={copied
                            ? <DoneIcon sx={{ fontSize: '15px' }} />
                            : <ContentCopyIcon sx={{ fontSize: '15px' }} />}
                        onClick={handleCopy}
                        sx={{ transition: 'all 0.2s' }}
                    >
                        {copied ? '¡Copiado!' : 'Copiar'}
                    </Button>
                </Box>
            </Box>

            {/* ── Claves y datos tecnicos ────────────────────────────── */}
            <Box sx={{ px: 2.5, py: 2.5 }}>
                <Stack spacing={0}>
                    <CopyableField label="ID de contacto" value={identity?.upeerId || '—'} onInfo={() => toggleInfo('id')} />
                    <Divider sx={{ my: 0.5 }} />
                    <CopyableField label="Clave de verificación" value={identity?.publicKey || '—'} onInfo={() => toggleInfo('clave')} />
                    <Divider sx={{ my: 0.5 }} />
                    <CopyableField label="Dirección de red" value={addr || '—'} onInfo={() => toggleInfo('red')} />
                </Stack>
            </Box>

            {/* ── Modal QR ─────────────────────────────────────────── */}
            <Modal open={showQR} onClose={() => setShowQR(false)}>
                <ModalDialog
                    variant="outlined"
                    sx={{ maxWidth: 380, width: '90%', alignItems: 'center', textAlign: 'center', gap: 2 }}
                >
                    <ModalClose />
                    <Typography level="title-md" sx={{ fontWeight: 700 }}>Tu dirección de contacto</Typography>
                    <Typography level="body-xs" color="neutral">
                        Muestra este código para que alguien te agregue como contacto
                    </Typography>
                    <Box sx={{
                        p: 2.5,
                        borderRadius: 'md',
                        backgroundColor: '#ffffff',
                        display: 'inline-flex',
                        boxShadow: 'sm',
                    }}>
                        {fullId
                            ? <QRCodeSVG value={fullId} size={220} level="M" includeMargin={false} />
                            : <Typography level="body-sm" color="neutral" sx={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sin dirección</Typography>
                        }
                    </Box>
                    <Box sx={{
                        width: '100%', px: 1.5, py: 1,
                        borderRadius: 'sm',
                        backgroundColor: 'background.level1',
                        fontFamily: 'monospace', fontSize: '11px',
                        wordBreak: 'break-all', textAlign: 'left',
                        color: 'text.secondary',
                    }}>
                        {fullId || '—'}
                    </Box>
                    <Button
                        fullWidth
                        variant={copied ? 'soft' : 'outlined'}
                        color={copied ? 'success' : 'neutral'}
                        startDecorator={copied ? <DoneIcon /> : <ContentCopyIcon />}
                        onClick={handleCopy}
                        sx={{ transition: 'all 0.2s' }}
                    >
                        {copied ? '¡Copiado!' : 'Copiar dirección'}
                    </Button>
                </ModalDialog>
            </Modal>

            {/* ── Modal informativo ─────────────────────────────────── */}
            <Modal open={activeInfo !== null} onClose={() => setActiveInfo(null)}>
                <ModalDialog variant="outlined" sx={{ maxWidth: 480, width: '90%' }}>
                    <ModalClose />
                    <Box sx={{ pt: 1 }}>
                        {activeInfo === 'reputacion' && <ReputacionModalContent />}
                        {activeInfo === 'almacenamiento' && <AlmacenamientoModalContent />}
                        {activeInfo === 'direccion' && <DireccionContactoModalContent />}
                        {activeInfo === 'id' && <IdContactoModalContent />}
                        {activeInfo === 'clave' && <ClaveVerificacionModalContent />}
                        {activeInfo === 'red' && <DireccionRedModalContent />}
                    </Box>
                </ModalDialog>
            </Modal>
        </Box>
    );
};
