import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    Input,
    LinearProgress,
    Stack,
    Tooltip,
    Typography,
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
import { CopyableField } from './shared.js';

export type ReputationData = {
    vouchScore: number;
    connectionCount: number;
};

export const DEFAULT_REPUTATION: ReputationData = {
    vouchScore: 50,
    connectionCount: 0,
};

export type InfoKey = 'reputacion' | 'almacenamiento' | 'direccion' | 'id' | 'clave' | 'red';

interface ProfileHeroSectionProps {
    avatar: string;
    alias: string;
    identityId?: string;
    displayName: string;
    isEditingAlias: boolean;
    isSaving: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onAvatarClick: () => void;
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onAliasChange: (value: string) => void;
    onAliasEdit: () => void;
    onAliasCancel: () => void;
    onAliasSave: () => void;
}

export const ProfileHeroSection: React.FC<ProfileHeroSectionProps> = ({
    avatar,
    alias,
    identityId,
    displayName,
    isEditingAlias,
    isSaving,
    fileInputRef,
    onAvatarClick,
    onFileChange,
    onAliasChange,
    onAliasEdit,
    onAliasCancel,
    onAliasSave,
}) => (
    <Box
        sx={{
            px: 2.5,
            py: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.surface',
        }}
    >
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />

        <Tooltip title="Cambiar foto de perfil" variant="soft" size="sm">
            <Box onClick={onAvatarClick} sx={{ width: 96, height: 96, borderRadius: 'lg', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', position: 'relative', '&:hover .avatar-overlay': { opacity: 1 } }}>
                {avatar ? (
                    <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <Avatar sx={{ width: '100%', height: '100%', fontSize: '2.5rem', borderRadius: 'lg' }}>{displayName.charAt(0).toUpperCase()}</Avatar>
                )}
                <Box className="avatar-overlay" sx={{ position: 'absolute', inset: 0, borderRadius: 'lg', backgroundColor: 'rgba(0,0,0,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.18s' }}>
                    <EditIcon sx={{ color: 'white', fontSize: '24px' }} />
                </Box>
            </Box>
        </Tooltip>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography level="body-xs" sx={{ fontWeight: 600, mb: 0.5, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nombre</Typography>
            {isEditingAlias ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Input
                        autoFocus
                        size="md"
                        value={alias}
                        onChange={(event) => onAliasChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') onAliasSave();
                            if (event.key === 'Escape') onAliasCancel();
                        }}
                        placeholder="Escribe tu nombre..."
                        sx={{ flexGrow: 1 }}
                    />
                    <IconButton size="sm" color="success" disabled={isSaving} onClick={onAliasSave}><CheckIcon /></IconButton>
                </Stack>
            ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', mb: 0.5 }} onClick={onAliasEdit}>
                    {alias ? <Typography level="h4" sx={{ fontWeight: 600 }}>{alias}</Typography> : <Typography level="h4" sx={{ fontStyle: 'italic', opacity: 0.4, fontWeight: 400 }}>Sin nombre</Typography>}
                    <EditIcon sx={{ fontSize: '15px', opacity: 0.35 }} />
                </Box>
            )}
            <Typography level="body-xs" color="neutral" noWrap sx={{ fontFamily: 'monospace', opacity: 0.45 }}>
                {identityId ? identityId.slice(0, 24) + '…' : '—'}
            </Typography>
        </Box>
    </Box>
);

interface ProfileStatsSectionProps {
    myReputation: ReputationData | null;
    vaultStats: { count: number; sizeBytes: number } | null;
    fmtBytes: (bytes: number) => string;
    onToggleInfo: (key: InfoKey) => void;
}

export const ProfileStatsSection: React.FC<ProfileStatsSectionProps> = ({ myReputation, vaultStats, fmtBytes, onToggleInfo }) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 2.5, py: 2.5, borderRight: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <SecurityIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Reputacion</Typography>
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
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => onToggleInfo('reputacion')}><InfoOutlinedIcon sx={{ fontSize: '16px' }} /></IconButton>
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
            })() : <Typography level="body-xs" sx={{ opacity: 0.4 }}>Cargando...</Typography>}
        </Box>

        <Box sx={{ px: 2.5, py: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <CloudDoneIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Almac. cedido</Typography>
                </Box>
                <Tooltip title="¿Qué es el almacenamiento cedido?" variant="soft" size="sm">
                    <IconButton size="sm" variant="plain" color="neutral" onClick={() => onToggleInfo('almacenamiento')}><InfoOutlinedIcon sx={{ fontSize: '16px' }} /></IconButton>
                </Tooltip>
            </Box>

            {vaultStats !== null ? (() => {
                const usageGB = vaultStats.sizeBytes / (1024 * 1024 * 1024);
                const pct = Math.min(usageGB * 100, 100);
                return (
                    <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                            <Typography level="body-sm" sx={{ fontWeight: 600 }}>{fmtBytes(vaultStats.sizeBytes)}</Typography>
                            <Typography level="body-xs" sx={{ opacity: 0.4 }}>usados</Typography>
                        </Box>
                        <LinearProgress determinate value={pct} size="sm" color={usageGB > 0.8 ? 'warning' : 'neutral'} sx={{ mb: 1.5, borderRadius: 'sm' }} />
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                            <Box>
                                <Typography level="body-xs" sx={{ opacity: 0.45, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Archivos P2P</Typography>
                                <Typography level="body-sm" sx={{ fontWeight: 600 }}>{vaultStats.count}</Typography>
                            </Box>
                            <Box>
                                <Typography level="body-xs" sx={{ opacity: 0.45, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cuota dinámica</Typography>
                                <Typography level="body-sm" sx={{ fontWeight: 600 }}>Activa</Typography>
                            </Box>
                        </Box>
                    </>
                );
            })() : <Typography level="body-xs" sx={{ opacity: 0.4 }}>Cargando...</Typography>}
        </Box>
    </Box>
);

interface ProfileAddressSectionProps {
    fullId: string;
    copied: boolean;
    onCopy: () => void;
    onShowQr: () => void;
    onToggleInfo: (key: InfoKey) => void;
}

export const ProfileAddressSection: React.FC<ProfileAddressSectionProps> = ({ fullId, copied, onCopy, onShowQr, onToggleInfo }) => (
    <Box sx={{ px: 2.5, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <FingerprintIcon sx={{ fontSize: '16px', opacity: 0.45 }} />
            <Typography level="body-sm" sx={{ fontWeight: 600, flexGrow: 1 }}>Tu dirección de contacto</Typography>
            <Tooltip title="¿Qué es esto?" variant="soft" size="sm">
                <IconButton size="sm" variant="plain" color="neutral" onClick={() => onToggleInfo('direccion')}><InfoOutlinedIcon sx={{ fontSize: '16px' }} /></IconButton>
            </Tooltip>
        </Box>
        <CopyableField label="Comparte esta dirección para que puedan escribirte" value={fullId} />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <Button variant="outlined" color="neutral" size="sm" startDecorator={<QrCode2Icon sx={{ fontSize: '15px' }} />} onClick={onShowQr}>Mostrar QR</Button>
            <Button variant={copied ? 'soft' : 'outlined'} color={copied ? 'success' : 'neutral'} size="sm" startDecorator={copied ? <DoneIcon sx={{ fontSize: '15px' }} /> : <ContentCopyIcon sx={{ fontSize: '15px' }} />} onClick={onCopy} sx={{ transition: 'all 0.2s' }}>
                {copied ? '¡Copiado!' : 'Copiar'}
            </Button>
        </Box>
    </Box>
);

interface ProfileTechnicalSectionProps {
    identityId?: string;
    publicKey?: string;
    networkAddress: string;
    onToggleInfo: (key: InfoKey) => void;
}

export const ProfileTechnicalSection: React.FC<ProfileTechnicalSectionProps> = ({ identityId, publicKey, networkAddress, onToggleInfo }) => (
    <Box sx={{ px: 2.5, py: 2.5 }}>
        <Stack spacing={0}>
            <CopyableField label="ID de contacto" value={identityId || '—'} onInfo={() => onToggleInfo('id')} />
            <Divider sx={{ my: 0.5 }} />
            <CopyableField label="Clave de verificación" value={publicKey || '—'} onInfo={() => onToggleInfo('clave')} />
            <Divider sx={{ my: 0.5 }} />
            <CopyableField label="Dirección de red" value={networkAddress || '—'} onInfo={() => onToggleInfo('red')} />
        </Stack>
    </Box>
);
