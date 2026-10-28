import React from 'react';
import { Box, Divider, IconButton, Tooltip } from '@mui/joy';
import { Copy, Pin, Share2, Star, Trash2, X } from 'lucide-react';
import { describeSelection, type SelectionSummary } from './bulkSelection.js';

interface SelectionToolbarProps {
    summary: SelectionSummary;
    onClear: () => void;
    onStar: () => void;
    onPin: () => void;
    onCopy: () => void;
    onForward: () => void;
    onDelete: () => void;
}

const Action: React.FC<{
    label: string;
    hint: string;
    color: 'neutral' | 'primary' | 'warning' | 'danger';
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ label, hint, color, disabled, onClick, children }) => (
    <Tooltip title={hint} variant="soft">
        <span>
            <IconButton size="sm" variant="plain" color={color} aria-label={label} disabled={disabled} onClick={onClick}>
                {children}
            </IconButton>
        </span>
    </Tooltip>
);

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
    summary,
    onClear,
    onStar,
    onPin,
    onCopy,
    onForward,
    onDelete,
}) => {
    const empty = summary.total === 0;
    const deleteHint = summary.mine === 0
        ? 'Solo puedes eliminar mensajes propios'
        : summary.others > 0
            ? `Se eliminarán ${summary.mine} de ${summary.total}: el resto no es tuyo`
            : `Eliminar ${summary.mine === 1 ? 'el mensaje' : `los ${summary.mine} mensajes`}`;

    return (
        <Box
            data-testid="selection-toolbar"
            sx={{
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1200,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.5,
                borderRadius: 'lg',
                backgroundColor: 'background.surface',
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: 'lg',
                maxWidth: 'calc(100% - 32px)',
            }}
        >
            <IconButton size="sm" variant="plain" color="neutral" aria-label="Salir de la selección" onClick={onClear}>
                <X style={{ fontSize: 18 }} />
            </IconButton>
            <Box sx={{ px: 0.5, minWidth: 96 }}>
                <Box component="span" sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                    {describeSelection(summary.total)}
                </Box>
            </Box>
            <Divider orientation="vertical" />
            <Action
                label="Destacar seleccionados"
                hint={summary.allStarred ? 'Quitar destacado' : 'Destacar'}
                color="warning"
                disabled={empty}
                onClick={onStar}
            >
                <Star fill={summary.allStarred ? 'currentColor' : 'none'} style={{ fontSize: 18 }} />
            </Action>
            <Action
                label="Fijar seleccionados"
                hint={summary.allPinned ? 'Desfijar' : 'Fijar'}
                color="primary"
                disabled={empty}
                onClick={onPin}
            >
                <Pin fill={summary.allPinned ? 'currentColor' : 'none'} style={{ fontSize: 18 }} />
            </Action>
            <Action
                label="Copiar seleccionados"
                hint="Copiar el texto"
                color="neutral"
                disabled={empty}
                onClick={onCopy}
            >
                <Copy style={{ fontSize: 18 }} />
            </Action>
            <Action
                label="Reenviar seleccionados"
                hint="Reenviar"
                color="neutral"
                disabled={empty}
                onClick={onForward}
            >
                <Share2 style={{ fontSize: 18 }} />
            </Action>
            <Action
                label="Eliminar seleccionados"
                hint={deleteHint}
                color="danger"
                disabled={summary.mine === 0}
                onClick={onDelete}
            >
                <Trash2 style={{ fontSize: 18 }} />
            </Action>
        </Box>
    );
};
