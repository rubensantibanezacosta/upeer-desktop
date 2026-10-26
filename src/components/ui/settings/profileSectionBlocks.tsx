import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    IconButton,
    Input,
    LinearProgress,
    Stack,
    Tooltip,
    Typography,
} from '@mui/joy';
import { Pencil, Check, Copy, Fingerprint, QrCode, ShieldCheck, CloudCheck, BadgeCheck, CircleCheck, ShieldAlert, Info } from 'lucide-react';
import { CopyableField } from './shared.js';
import { CardGroupLabel } from './sectionShell.js';

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
            px: 0.5,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
        }}
    >
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />

        <Tooltip title="Cambiar foto de perfil" variant="soft" size="sm">
            <Box onClick={onAvatarClick} sx={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', position: 'relative', '&:hover .avatar-overlay': { opacity: 1 } }}>
                {avatar ? (
                    <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <Avatar sx={{ width: '100%', height: '100%', fontSize: '2.5rem' }}>{displayName.charAt(0).toUpperCase()}</Avatar>
                )}
                <Box className="avatar-overlay" sx={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.18s' }}>
                    <Pencil style={{ color: 'white', fontSize: 24 }} />
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
                    <IconButton size="sm" color="success" disabled={isSaving} onClick={onAliasSave}><Check style={{ fontSize: 18 }} /></IconButton>
                </Stack>
            ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', mb: 0.5 }} onClick={onAliasEdit}>
                    {alias ? <Typography level="h4" sx={{ fontWeight: 600 }}>{alias}</Typography> : <Typography level="h4" sx={{ fontStyle: 'italic', opacity: 0.4, fontWeight: 400 }}>Sin nombre</Typography>}
                    <Pencil style={{ fontSize: 15, opacity: 0.35 }} />
                </Box>
            )}
            <Typography level="body-xs" color="neutral" noWrap sx={{ fontFamily: 'monospace', opacity: 0.45 }}>
                {identityId ? identityId.slice(0, 24) + '…' : '—'}
            </Typography>
        </Box>
    </Box>
);

interface ProfileReputationSectionProps {
    myReputation: ReputationData | null;
    onToggleInfo: (key: InfoKey) => void;
}

const reputationBadge = (myReputation: ReputationData | null): React.ReactNode => {
    if (!myReputation) {
        return undefined;
    }
    const { vouchScore, connectionCount } = myReputation;
    const isNew = vouchScore === 50 && connectionCount === 0;
    let color: 'success' | 'primary' | 'neutral' | 'danger' = 'neutral';
    let icon = <ShieldCheck style={{ fontSize: 12 }} />;
    let label = isNew ? 'Sin historial' : 'Estándar';
    if (!isNew) {
        if (vouchScore >= 80) { color = 'success'; icon = <BadgeCheck style={{ fontSize: 12 }} />; label = 'Alta'; }
        else if (vouchScore >= 65) { color = 'primary'; icon = <CircleCheck style={{ fontSize: 12 }} />; label = 'Buena'; }
        else if (vouchScore < 40) { color = 'danger'; icon = <ShieldAlert style={{ fontSize: 12 }} />; label = 'Baja'; }
    }
    return (
        <Chip size="sm" color={color} variant="soft" startDecorator={icon} sx={{ fontSize: '11px' }}>{label}</Chip>
    );
};

export const ProfileReputationSection: React.FC<ProfileReputationSectionProps> = ({ myReputation, onToggleInfo }) => (
    <Box>
        <CardGroupLabel
            icon={<ShieldCheck style={{ fontSize: 15 }} />}
            title="Reputación"
            badge={reputationBadge(myReputation)}
            action={
                <Tooltip title="¿Qué es la reputación?" variant="soft" size="sm">
                    <IconButton size="sm" variant="plain" color="neutral" onClick={() => onToggleInfo('reputacion')}><Info style={{ fontSize: 16 }} /></IconButton>
                </Tooltip>
            }
        />
        <Box sx={{ px: 0.5, pb: 1 }}>
            {myReputation ? (() => {
                const { vouchScore, connectionCount } = myReputation;
                const barColor = vouchScore >= 80 ? 'success' : vouchScore >= 65 ? 'primary' : vouchScore < 40 ? 'danger' : 'neutral';
                return (
                    <>
                        <LinearProgress determinate value={vouchScore} size="sm" color={barColor} sx={{ mb: 1.5, borderRadius: 'sm' }} />
                        <Box sx={{ display: 'flex', gap: 5 }}>
                            {[
                                { label: 'Vouches', value: `${vouchScore}/100` },
                                { label: 'Contactos', value: String(connectionCount) },
                            ].map(({ label, value }) => (
                                <Box key={label}>
                                    <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</Typography>
                                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>{value}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </>
                );
            })() : <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Cargando...</Typography>}
        </Box>
    </Box>
);

interface ProfileVaultSectionProps {
    vaultStats: { count: number; sizeBytes: number } | null;
    fmtBytes: (bytes: number) => string;
    onToggleInfo: (key: InfoKey) => void;
}

export const ProfileVaultSection: React.FC<ProfileVaultSectionProps> = ({ vaultStats, fmtBytes, onToggleInfo }) => (
    <Box>
        <CardGroupLabel
            icon={<CloudCheck style={{ fontSize: 15 }} />}
            title="Almacenamiento cedido"
            action={
                <Tooltip title="¿Qué es el almacenamiento cedido?" variant="soft" size="sm">
                    <IconButton size="sm" variant="plain" color="neutral" onClick={() => onToggleInfo('almacenamiento')}><Info style={{ fontSize: 16 }} /></IconButton>
                </Tooltip>
            }
        />
        <Box sx={{ px: 0.5, pb: 1 }}>
            {vaultStats !== null ? (() => {
                const usageGB = vaultStats.sizeBytes / (1024 * 1024 * 1024);
                const pct = Math.min(usageGB * 100, 100);
                return (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                            <Typography level="body-sm" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtBytes(vaultStats.sizeBytes)}</Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>usados de 1 GB cedido</Typography>
                        </Box>
                        <LinearProgress determinate value={pct} size="sm" color={usageGB > 0.8 ? 'warning' : 'neutral'} sx={{ mb: 1.5, borderRadius: 'sm' }} />
                        <Box sx={{ display: 'flex', gap: 5 }}>
                            <Box>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Archivos P2P</Typography>
                                <Typography level="body-sm" sx={{ fontWeight: 600 }}>{vaultStats.count}</Typography>
                            </Box>
                            <Box>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cuota dinámica</Typography>
                                <Typography level="body-sm" sx={{ fontWeight: 600 }}>Activa</Typography>
                            </Box>
                        </Box>
                    </>
                );
            })() : <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Cargando...</Typography>}
        </Box>
    </Box>
);

interface ProfileAddressSectionProps {
    fullId: string;
    copied: boolean;
    copyError: string;
    onCopy: () => void;
    onShowQr: () => void;
    onToggleInfo: (key: InfoKey) => void;
}

export const ProfileAddressSection: React.FC<ProfileAddressSectionProps> = ({ fullId, copied, copyError, onCopy, onShowQr, onToggleInfo }) => (
    <Box>
        <CardGroupLabel
            icon={<Fingerprint style={{ fontSize: 15 }} />}
            title="Tu dirección de contacto"
            action={
                <Tooltip title="¿Qué es esto?" variant="soft" size="sm">
                    <IconButton size="sm" variant="plain" color="neutral" onClick={() => onToggleInfo('direccion')}><Info style={{ fontSize: 16 }} /></IconButton>
                </Tooltip>
            }
        />
        <Box sx={{ px: 0.5, pb: 1, pt: 0.5 }}>
        <CopyableField label="Comparte esta dirección para que puedan escribirte" value={fullId} />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <Button variant="outlined" color="neutral" size="sm" startDecorator={<QrCode style={{ fontSize: 15 }} />} onClick={onShowQr}>Mostrar QR</Button>
            <Button variant={copied ? 'soft' : 'outlined'} color={copied ? 'success' : 'neutral'} size="sm" startDecorator={copied ? <Check style={{ fontSize: 15 }} /> : <Copy style={{ fontSize: 15 }} />} onClick={onCopy} sx={{ transition: 'all 0.2s' }}>
                {copied ? '¡Copiado!' : 'Copiar'}
            </Button>
        </Box>
        {copyError && <Typography level="body-xs" color="danger" sx={{ mt: 1 }}>No se pudo copiar al portapapeles: {copyError}</Typography>}
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
    <Box>
        <CardGroupLabel icon={<Fingerprint style={{ fontSize: 15 }} />} title="Datos técnicos" />
        <Stack spacing={0} sx={{ px: 0.5, pb: 1, pt: 0.5 }}>
            <CopyableField label="ID de contacto" value={identityId || '—'} onInfo={() => onToggleInfo('id')} />
            <Box sx={{ height: 12 }} />
            <CopyableField label="Clave de verificación" value={publicKey || '—'} onInfo={() => onToggleInfo('clave')} />
            <Box sx={{ height: 12 }} />
            <CopyableField label="Dirección de red" value={networkAddress || '—'} onInfo={() => onToggleInfo('red')} />
        </Stack>
    </Box>
);
