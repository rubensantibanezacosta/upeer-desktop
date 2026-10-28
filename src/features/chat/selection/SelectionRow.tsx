import React from 'react';
import { Box, Checkbox } from '@mui/joy';

interface SelectionRowProps {
    msgId?: string;
    isSelected: boolean;
    selectionMode: boolean;
    marginBottom: number;
    isPendingSend: boolean;
    onHoverChange: (hovered: boolean) => void;
    onToggleSelect?: (id: string) => void;
    children: React.ReactNode;
}

export const SelectionRow: React.FC<SelectionRowProps> = ({
    msgId,
    isSelected,
    selectionMode,
    marginBottom,
    isPendingSend,
    onHoverChange,
    onToggleSelect,
    children,
}) => (
    <Box
        id={`msg-${msgId}`}
        className={isPendingSend ? 'chat-bubble-enter' : undefined}
        data-selected={selectionMode ? (isSelected ? 'true' : 'false') : undefined}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onClick={selectionMode ? () => { if (msgId) onToggleSelect?.(msgId); } : undefined}
        sx={{
            alignSelf: 'stretch',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            transformOrigin: 'right bottom',
            mb: marginBottom,
            cursor: selectionMode ? 'pointer' : undefined,
            borderRadius: 'md',
            backgroundColor: selectionMode && isSelected ? 'primary.softBg' : 'transparent',
            transition: 'background-color 0.12s ease',
        }}
    >
        {children}
    </Box>
);

export const SelectionCheckbox: React.FC<{ msgId?: string; isSelected: boolean }> = ({ msgId, isSelected }) => (
    <Checkbox
        size="sm"
        checked={isSelected}
        readOnly
        tabIndex={-1}
        aria-label={`Seleccionar mensaje ${msgId ?? ''}`}
        sx={{ mt: 0.75, pointerEvents: 'none', flexShrink: 0 }}
    />
);
