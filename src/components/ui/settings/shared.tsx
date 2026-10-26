import React, { useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    ListItem,
    ListItemButton,
    ListItemDecorator,
    Switch,
} from '@mui/joy';
import { Check, Copy, Info } from 'lucide-react';
import { resizeImageToDataUrl as resizeImageToDataUrlBase } from '../../../utils/resizeImageToDataUrl.js';
import type { SxProps } from '@mui/joy/styles/types';
import { INPUT_PILL_RADIUS } from '../../../inputShape.js';
import { listRowButtonSx, listRowDecoratorSx, listRowListItemSx } from '../../layout/listRowMetrics.js';

const rowButtonSx: SxProps = {
    ...listRowButtonSx,
    '&:hover': { backgroundColor: 'background.level2' },
    '&.Mui-selected:hover': { backgroundColor: 'background.level2' },
};

export const rowIconSx: SxProps = {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'text.tertiary',
    fontSize: '20px',
};

const RowIcon: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <ListItemDecorator sx={listRowDecoratorSx}>
        <Box sx={rowIconSx}>{children}</Box>
    </ListItemDecorator>
);

// ─── Campo copiable ───────────────────────────────────────────────────────────

export const CopyableField: React.FC<{ label: string; value: string; onInfo?: () => void }> = ({ label, value, onInfo }) => {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState('');
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
                            <Info style={{ fontSize: 16, opacity: 0.5 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                backgroundColor: 'background.level1', px: 1.5, py: 1.25,
                borderRadius: INPUT_PILL_RADIUS,
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
                        onClick={async () => {
                            try {
                                const result = await window.upeer.writeClipboardText(value);
                                if (!result.success) throw new Error(result.error || 'Motivo no disponible');
                                setCopied(true);
                                setCopyError('');
                                setTimeout(() => setCopied(false), 2000);
                            } catch (cause) {
                                setCopied(false);
                                setCopyError(cause instanceof Error ? cause.message : String(cause));
                            }
                        }}
                    >
                        {copied
                            ? <Check style={{ fontSize: 16 }} />
                            : <Copy style={{ fontSize: 16 }} />
                        }
                    </IconButton>
                </Tooltip>
            </Box>
            {copyError && <Typography level="body-xs" color="danger">No se pudo copiar al portapapeles: {copyError}</Typography>}
        </Box>
    );
};

// ─── Fila con toggle ──────────────────────────────────────────────────────────

export const ToggleRow: React.FC<{
    icon?: React.ReactNode;
    label: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
}> = ({ icon, label, desc, value, onChange }) => (
    <ListItem sx={listRowListItemSx}>
        <ListItemButton sx={rowButtonSx} onClick={() => onChange(!value)}>
            {icon && <RowIcon>{icon}</RowIcon>}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
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

export const InfoRow: React.FC<{ icon?: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <ListItem sx={listRowListItemSx}>
        <ListItemButton sx={{ ...rowButtonSx, height: '52px', minHeight: '52px', cursor: 'default', '&:hover': { backgroundColor: 'transparent' } }}>
            {icon && (
                <ListItemDecorator sx={{ ...listRowDecoratorSx, minInlineSize: '28px' }}>
                    <Box sx={{ ...rowIconSx, width: 24, height: 24, fontSize: '18px' }}>{icon}</Box>
                </ListItemDecorator>
            )}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography level="body-md" sx={{ fontWeight: 500 }}>{label}</Typography>
            </Box>
            <Typography level="body-sm" color="neutral">{value}</Typography>
        </ListItemButton>
    </ListItem>
);

// ─── Helper: redimensionar imagen a 128×128 JPEG ─────────────────────────────

export const resizeImageToDataUrl = (file: File): Promise<string> =>
    resizeImageToDataUrlBase(file, { size: 128, quality: 0.85, maxBytes: 10 * 1024 * 1024 });
