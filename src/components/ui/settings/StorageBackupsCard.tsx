import React, { useCallback, useEffect, useState } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    DialogTitle,
    Modal,
    ModalDialog,
    Typography,
} from '@mui/joy';
import { DatabaseBackup, RotateCcw } from 'lucide-react';
import { CardGroupLabel, SettingsCard } from './sectionShell.js';

type BackupsPayload = Awaited<ReturnType<NonNullable<Window['upeer']>['listDatabaseBackups']>>;
type Backup = BackupsPayload['backups'][number];

const fmt = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    const decimals = exponent === 0 || value >= 100 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[exponent]}`;
};

const backupDate = (createdAt: string): string => {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return createdAt;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const StorageBackupsCard: React.FC = () => {
    const [data, setData] = useState<BackupsPayload | null>(null);
    const [loadError, setLoadError] = useState('');
    const [selected, setSelected] = useState<Backup | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [restoreError, setRestoreError] = useState('');
    const [restored, setRestored] = useState(false);

    const load = useCallback(async () => {
        try {
            const next = await window.upeer.listDatabaseBackups();
            setData(next);
            setLoadError('');
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'No se pudieron leer las copias');
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const handleRestore = async () => {
        if (!selected) return;
        setRestoring(true);
        try {
            const result = await window.upeer.restoreDatabaseBackup(selected.name);
            if (!result.restored) {
                setRestoreError(result.error ?? 'No se pudo restaurar la copia');
                return;
            }
            setRestoreError('');
            setRestored(true);
            setSelected(null);
            await load();
        } catch (error) {
            setRestoreError(error instanceof Error ? error.message : 'No se pudo restaurar la copia');
        } finally {
            setRestoring(false);
        }
    };

    const backups = data?.backups ?? [];

    return (
        <SettingsCard>
            <CardGroupLabel
                icon={<DatabaseBackup style={{ fontSize: 15 }} />}
                title="Copias de la base de datos"
                description={`Copia automática diaria de la base cifrada. Se conservan ${data?.retentionDays ?? 7} días.`}
            />
            <Box sx={{ px: 0.5, pb: 1 }}>
                {loadError && <Typography level="body-sm" color="danger" sx={{ mb: 1 }}>{loadError}</Typography>}
                {restored && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            mb: 1.5,
                            p: 1.25,
                            borderRadius: 'sm',
                            bgcolor: 'success.softBg',
                        }}
                    >
                        <Typography level="body-sm" sx={{ color: 'text.primary' }}>
                            Copia restaurada. Reinicia uPeer para usarla.
                        </Typography>
                        <Button size="sm" variant="solid" color="success" onClick={() => void window.upeer.restartApp()}>
                            Reiniciar ahora
                        </Button>
                    </Box>
                )}
                {!data && !loadError && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size="sm" />
                    </Box>
                )}
                {data && backups.length === 0 && (
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        Todavía no hay copias. La primera se crea al arrancar la aplicación.
                    </Typography>
                )}
                {backups.map((backup) => (
                    <Box key={backup.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75 }}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography level="body-sm" sx={{ fontWeight: 500 }}>{backupDate(backup.createdAt)}</Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{fmt(backup.bytes)}</Typography>
                        </Box>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            startDecorator={<RotateCcw style={{ fontSize: 15 }} />}
                            onClick={() => {
                                setRestoreError('');
                                setSelected(backup);
                            }}
                        >
                            Restaurar
                        </Button>
                    </Box>
                ))}
            </Box>

            <Modal open={selected !== null} onClose={() => (restoring ? undefined : setSelected(null))}>
                <ModalDialog size="sm" sx={{ maxWidth: 440 }}>
                    <DialogTitle>Restaurar la copia</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                            Se reemplazará la base de datos actual por la del {selected ? backupDate(selected.createdAt) : ''}.
                            uPeer guarda antes una copia de la base actual, por si la restauración no era lo que querías.
                            Los mensajes escritos después de esa copia dejarán de verse.
                        </Typography>
                        {restoreError && <Typography level="body-sm" color="danger" sx={{ mt: 1 }}>{restoreError}</Typography>}
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" color="neutral" disabled={restoring} onClick={() => setSelected(null)}>
                            Cancelar
                        </Button>
                        <Button color="warning" loading={restoring} onClick={() => void handleRestore()}>
                            Restaurar
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </SettingsCard>
    );
};
