import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Stack,
    Input,
    List,
    ListItem,
    ListItemDecorator,
    ListItemContent,
    ListItemButton,
    Chip,
    CircularProgress,
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import ImageIcon from '@mui/icons-material/Image';
import MovieIcon from '@mui/icons-material/Movie';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { getFileIcon } from '../../../utils/fileIcons.js';

type CategoryFilter = 'all' | UpeerFileHistoryEntry['category'];

const CATEGORY_TABS: { id: CategoryFilter; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Todos', icon: <InsertDriveFileIcon sx={{ fontSize: 16 }} /> },
    { id: 'image', label: 'Imágenes', icon: <ImageIcon sx={{ fontSize: 16 }} /> },
    { id: 'video', label: 'Vídeos', icon: <MovieIcon sx={{ fontSize: 16 }} /> },
    { id: 'audio', label: 'Audio', icon: <MusicNoteIcon sx={{ fontSize: 16 }} /> },
    { id: 'document', label: 'Documentos', icon: <DescriptionIcon sx={{ fontSize: 16 }} /> },
    { id: 'other', label: 'Otros', icon: <InsertDriveFileIcon sx={{ fontSize: 16 }} /> },
];

const fmtBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const fmtDate = (ts: number): string =>
    new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

export const FileHistoryExplorer: React.FC = () => {
    const [entries, setEntries] = useState<UpeerFileHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<CategoryFilter>('all');

    useEffect(() => {
        let mounted = true;
        window.upeer.getFileHistory(500)
            .then((result) => {
                if (mounted) setEntries(result);
            })
            .catch((err) => console.error('Error al obtener historial de archivos', err))
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return entries.filter((entry) => {
            if (category !== 'all' && entry.category !== category) return false;
            if (q && !entry.fileName.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [entries, query, category]);

    const openFile = async (entry: UpeerFileHistoryEntry) => {
        if (!entry.savedPath) return;
        const result = await window.upeer.openFile(entry.savedPath);
        if (!result.success && result.error) {
            console.error('No se pudo abrir el archivo', result.error);
        }
    };

    return (
        <Box sx={{ px: 1.5, py: 2 }}>
            <Typography level="title-md" sx={{ fontWeight: 600, mb: 0.5 }}>
                Historial de archivos
            </Typography>
            <Typography level="body-sm" color="neutral" sx={{ mb: 1.5 }}>
                Archivos compartidos, buscables y organizados por tipo
            </Typography>

            <Input
                aria-label="Buscar archivos compartidos"
                size="sm"
                startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                placeholder="Buscar por nombre de archivo…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                sx={{ mb: 1.5 }}
            />

            <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
                {CATEGORY_TABS.map((tab) => {
                    const selected = category === tab.id;
                    return (
                        <Chip
                            key={tab.id}
                            aria-label={`Filtrar por ${tab.label}`}
                            size="sm"
                            variant={selected ? 'solid' : 'soft'}
                            color={selected ? 'primary' : 'neutral'}
                            startDecorator={tab.icon}
                            onClick={() => setCategory(tab.id)}
                            sx={{ cursor: 'pointer' }}
                        >
                            {tab.label}
                        </Chip>
                    );
                })}
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size="sm" />
                </Box>
            ) : filtered.length === 0 ? (
                <Stack spacing={1} sx={{ alignItems: 'center', py: 4 }}>
                    <InsertDriveFileIcon sx={{ fontSize: 36, color: 'text.tertiary' }} />
                    <Typography level="body-sm" color="neutral">
                        {entries.length === 0 ? 'Todavía no hay archivos compartidos' : 'Sin resultados para el filtro actual'}
                    </Typography>
                </Stack>
            ) : (
                <List sx={{ p: 0, '--ListItem-paddingY': '0px' }}>
                    {filtered.map((entry) => (
                        <ListItem key={entry.messageId} sx={{ p: 0 }}>
                            <ListItemButton
                                aria-label={`Abrir ${entry.fileName}`}
                                disabled={!entry.savedPath}
                                onClick={() => openFile(entry)}
                                sx={{ px: 1, py: 0.75, borderRadius: 'sm', gap: 1.25 }}
                            >
                                <ListItemDecorator>
                                    {entry.thumbnail && entry.category === 'image' ? (
                                        <Box
                                            component="img"
                                            src={entry.thumbnail}
                                            alt=""
                                            sx={{ width: 38, height: 38, borderRadius: 'xs', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <Box sx={{
                                            width: 38,
                                            height: 38,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: 'background.level1',
                                            borderRadius: 'xs',
                                            color: 'text.secondary',
                                        }}>
                                            {getFileIcon(entry.mimeType, entry.fileName)}
                                        </Box>
                                    )}
                                </ListItemDecorator>
                                <ListItemContent sx={{ minWidth: 0 }}>
                                    <Typography level="body-sm" noWrap sx={{ fontWeight: 500 }}>
                                        {entry.fileName}
                                    </Typography>
                                    <Typography level="body-xs" color="neutral" noWrap>
                                        {fmtBytes(entry.fileSize)} · {fmtDate(entry.timestamp)} ·{' '}
                                        {entry.isMine ? 'Enviado' : 'Recibido'}
                                    </Typography>
                                </ListItemContent>
                                <Chip
                                    size="sm"
                                    variant="soft"
                                    color={entry.isMine ? 'primary' : 'neutral'}
                                    startDecorator={entry.isMine ? <CloudUploadIcon sx={{ fontSize: 14 }} /> : <CloudDownloadIcon sx={{ fontSize: 14 }} />}
                                >
                                    {entry.isMine ? 'Salida' : 'Entrada'}
                                </Chip>
                                {entry.savedPath && (
                                    <FolderOpenIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                                )}
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    );
};