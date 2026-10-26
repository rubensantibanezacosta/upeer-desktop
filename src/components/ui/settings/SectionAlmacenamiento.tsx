import React, { useCallback, useEffect, useState } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    Modal,
    ModalDialog,
    Tooltip,
    Typography,
} from '@mui/joy';
import { HardDrive, Monitor, MessagesSquare, Paperclip, DatabaseBackup, ShieldCheck, Trash2, RefreshCw } from 'lucide-react';
import { CardGroupLabel, SettingsCard, SettingsSection } from './sectionShell.js';

type StorageUsage = Awaited<ReturnType<NonNullable<Window['upeer']>['getStorageUsage']>>;

const VAULT_QUOTA_BYTES = 1024 * 1024 * 1024;

const fmt = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    const decimals = exponent === 0 || value >= 100 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[exponent]}`;
};

const BreakdownRow: React.FC<{ icon: React.ReactNode; label: string; hint: string; value: string }> = ({ icon, label, hint, value }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ display: 'flex', color: 'text.tertiary' }}>{icon}</Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography level="body-sm" sx={{ fontWeight: 500 }}>{label}</Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{hint}</Typography>
        </Box>
        <Typography level="body-sm" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
);

export const SectionAlmacenamiento: React.FC = () => {
    const [usage, setUsage] = useState<StorageUsage | null>(null);
    const [loadError, setLoadError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [clearError, setClearError] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await window.upeer.getStorageUsage();
            setUsage(next);
            setLoadError('');
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'No se pudo leer el uso de disco');
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const handleClearVault = async () => {
        setClearing(true);
        try {
            await window.upeer.clearVault();
            setClearError('');
            setConfirming(false);
            await load();
        } catch (error) {
            setClearError(error instanceof Error ? error.message : 'No se pudo vaciar el vault');
        } finally {
            setClearing(false);
        }
    };

    const vaultPercent = usage ? Math.min((usage.vaultBytes / VAULT_QUOTA_BYTES) * 100, 100) : 0;
    const vaultColor = vaultPercent > 80 ? 'danger' : vaultPercent > 60 ? 'warning' : 'primary';

    return (
        <SettingsSection
            icon={<HardDrive style={{ fontSize: 18 }} />}
            title="Almacenamiento"
            description="Qué ocupa uPeer en este dispositivo y cuánto espacio dedica a custodiar mensajes de otros usuarios."
            action={
                <Tooltip title="Actualizar datos" variant="soft" size="sm">
                    <IconButton size="sm" variant="plain" color="neutral" onClick={() => void load()}>
                        <RefreshCw style={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
            }
        >
            <SettingsCard>
                <CardGroupLabel
                    icon={<Monitor style={{ fontSize: 15 }} />}
                    title="En este dispositivo"
                    description="Mensajes, archivos y copias de seguridad que uPeer guarda en tu ordenador."
                />
                <Box sx={{ px: 0.5, pb: 1 }}>
                    {loadError && <Typography level="body-sm" color="danger" sx={{ mb: 1 }}>{loadError}</Typography>}
                    {usage ? (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                <Typography level="h1" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(usage.ownBytes)}
                                </Typography>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    {usage.messageCount} mensajes guardados
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 2 }}>
                                <BreakdownRow
                                    icon={<MessagesSquare style={{ fontSize: 18 }} />}
                                    label="Conversaciones e identidad"
                                    hint="Base de datos cifrada"
                                    value={fmt(usage.databaseBytes)}
                                />
                                <BreakdownRow
                                    icon={<Paperclip style={{ fontSize: 18 }} />}
                                    label="Archivos compartidos"
                                    hint={`${usage.attachmentCount} archivos en la carpeta de datos`}
                                    value={fmt(usage.attachmentsBytes)}
                                />
                                <BreakdownRow
                                    icon={<DatabaseBackup style={{ fontSize: 18 }} />}
                                    label="Copias de seguridad"
                                    hint="Se generan automáticamente cada día"
                                    value={fmt(usage.backupsBytes)}
                                />
                            </Box>
                        </>
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                            <CircularProgress size="sm" />
                        </Box>
                    )}
                </Box>
            </SettingsCard>

            <SettingsCard>
                <CardGroupLabel
                    icon={<ShieldCheck style={{ fontSize: 15 }} />}
                    title="Vault de mensajes"
                    description="Mensajes cifrados que custodias temporalmente para contactos desconectados."
                />
                <Box sx={{ px: 0.5, pb: 1 }}>
                    {usage ? (
                        <>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                                <Typography level="title-lg" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(usage.vaultBytes)}
                                </Typography>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    de {fmt(VAULT_QUOTA_BYTES)} · {usage.vaultEntries} mensajes
                                </Typography>
                            </Box>
                            <LinearProgress
                                determinate
                                value={vaultPercent}
                                size="sm"
                                color={vaultColor}
                                sx={{ borderRadius: 'sm' }}
                            />
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1.25 }}>
                                Cada mensaje se borra al entregarse a su destinatario o al caducar. Vaciar el vault elimina ahora
                                todo lo pendiente: lo que aún no se haya entregado se perderá.
                            </Typography>
                            {clearError && <Typography level="body-xs" color="danger" sx={{ mt: 1 }}>{clearError}</Typography>}
                            <Button
                                size="sm"
                                variant="soft"
                                color="danger"
                                startDecorator={<Trash2 style={{ fontSize: 16 }} />}
                                onClick={() => setConfirming(true)}
                                disabled={usage.vaultEntries === 0}
                                sx={{ mt: 1.75 }}
                            >
                                Vaciar vault
                            </Button>
                        </>
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                            <CircularProgress size="sm" />
                        </Box>
                    )}
                </Box>
            </SettingsCard>

            <Modal open={confirming} onClose={() => (clearing ? undefined : setConfirming(false))}>
                <ModalDialog size="sm" sx={{ maxWidth: 420 }}>
                    <DialogTitle>Vaciar el vault</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                            Se eliminarán {usage?.vaultEntries ?? 0} mensajes ({fmt(usage?.vaultBytes ?? 0)}) que custodias para
                            otros usuarios y todavía no se han entregado. Esta acción no se puede deshacer.
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" color="neutral" disabled={clearing} onClick={() => setConfirming(false)}>
                            Cancelar
                        </Button>
                        <Button color="danger" loading={clearing} onClick={() => void handleClearVault()}>
                            Vaciar vault
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </SettingsSection>
    );
};
