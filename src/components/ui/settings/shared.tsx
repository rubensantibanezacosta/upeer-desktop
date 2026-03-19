import React, { useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    ListItem,
    ListItemButton,
    Switch,
} from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// ─── Campo copiable ───────────────────────────────────────────────────────────

export const CopyableField: React.FC<{ label: string; value: string; onInfo?: () => void }> = ({ label, value, onInfo }) => {
    const [copied, setCopied] = useState(false);
    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Typography
                    level="body-xs"
                    sx={{ fontWeight: 600, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.06em', flexGrow: 1 }}
                >
                    {label}
                </Typography>
                {onInfo && (
                    <Tooltip title="¿Qué es esto?" variant="soft" size="sm">
                        <IconButton size="sm" variant="plain" color="neutral" onClick={onInfo}>
                            <InfoOutlinedIcon sx={{ fontSize: '16px', opacity: 0.5 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                backgroundColor: 'background.level1', px: 1.5, py: 1,
                border: '1px solid', borderColor: 'divider',
            }}>
                <Typography
                    level="body-sm"
                    sx={{ fontFamily: 'monospace', flexGrow: 1, wordBreak: 'break-all', fontSize: '12px', lineHeight: 1.6 }}
                >
                    {value || '—'}
                </Typography>
                <Tooltip title={copied ? 'Copiado' : 'Copiar'} variant="soft" size="sm">
                    <IconButton
                        size="sm"
                        variant="plain"
                        color={copied ? 'success' : 'neutral'}
                        onClick={() => {
                            navigator.clipboard.writeText(value);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        }}
                    >
                        {copied
                            ? <CheckIcon sx={{ fontSize: '16px' }} />
                            : <ContentCopyIcon sx={{ fontSize: '16px' }} />
                        }
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
};

// ─── Fila con toggle ──────────────────────────────────────────────────────────

export const ToggleRow: React.FC<{
    label: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
}> = ({ label, desc, value, onChange }) => (
    <ListItem sx={{ p: 0 }}>
        <ListItemButton
            sx={{ height: '72px', px: 1.5, borderRadius: 0, margin: 0 }}
            onClick={() => onChange(!value)}
        >
            <Box sx={{ flexGrow: 1 }}>
                <Typography level="body-md" sx={{ fontWeight: 500 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
            <Switch
                checked={value}
                onChange={(e) => { e.stopPropagation(); onChange(e.target.checked); }}
                onClick={(e) => e.stopPropagation()}
            />
        </ListItemButton>
    </ListItem>
);

// ─── Fila de informacion ──────────────────────────────────────────────────────

export const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <ListItem sx={{ p: 0 }}>
        <ListItemButton sx={{
            height: '72px', px: 1.5, borderRadius: 0, margin: 0,
            cursor: 'default', '&:hover': { backgroundColor: 'transparent' },
        }}>
            <Box sx={{ flexGrow: 1 }}>
                <Typography level="body-md" sx={{ fontWeight: 500 }}>{label}</Typography>
            </Box>
            <Typography level="body-sm" color="neutral">{value}</Typography>
        </ListItemButton>
    </ListItem>
);

// ─── Helper: redimensionar imagen a 128×128 JPEG ─────────────────────────────

export const resizeImageToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas context not available'));
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
