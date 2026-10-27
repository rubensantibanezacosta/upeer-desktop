import React, { useEffect, useRef } from 'react';
import { Box, Input, IconButton, Chip, Stack } from '@mui/joy';
import { Search, X } from 'lucide-react';
import { INPUT_PILL_RADIUS } from '../../inputShape.js';

const PILL_HEIGHT = 40;
const SEARCH_ICON_SIZE = 18;
const ICON_INSET = (PILL_HEIGHT - SEARCH_ICON_SIZE) / 2;
const CLEAR_BUTTON_SIZE = 24;
const CLEAR_GLYPH_SIZE = 16;

interface SidebarSearchProps {
    value: string;
    onChange: (val: string) => void;
    activeFilter?: string;
    onFilterChange?: (filter: string) => void;
    filters?: Array<{ label: string; value: string }>;
    placeholder?: string;
    showFilters?: boolean;
    autoFocus?: boolean;
    focusKey?: string;
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
    value,
    onChange,
    activeFilter = 'all',
    onFilterChange,
    filters,
    placeholder = 'Busca chats, contactos, grupos o mensajes',
    showFilters = true,
    autoFocus = false,
    focusKey,
    onKeyDown,
}) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const availableFilters = filters ?? [
        { label: 'Todos', value: 'all' },
        { label: 'No leídos', value: 'unread' },
        { label: 'Favoritos', value: 'favorites' },
        { label: 'Grupos', value: 'groups' }
    ];

    useEffect(() => {
        if (!autoFocus) return;
        const input = inputRef.current;
        if (!input) return;
        const timer = window.setTimeout(() => {
            input.focus({ preventScroll: true });
        }, 230);
        return () => window.clearTimeout(timer);
    }, [autoFocus, focusKey]);

    return (
        <Box sx={{ p: 1, px: 1.5, display: 'flex', flexDirection: 'column', gap: 1, backgroundColor: 'background.surface' }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'background.level1',
                    borderRadius: INPUT_PILL_RADIUS,
                    border: '1px solid transparent',
                    px: `${ICON_INSET}px`,
                    flexGrow: 1,
                    height: `${PILL_HEIGHT}px`,
                    transition: 'border-color 0.15s',
                    '&:focus-within': {
                        borderColor: 'var(--joy-palette-primary-300)',
                    },
                }}>
                    <Search style={{ fontSize: SEARCH_ICON_SIZE, color: 'var(--joy-palette-text-tertiary)', marginRight: 8 }} />
                    <Input
                        size="sm"
                        placeholder={placeholder}
                        variant="plain"
                        value={value}
                        slotProps={{ input: { maxLength: 80, ref: inputRef } }}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        sx={{
                            flexGrow: 1,
                            backgroundColor: 'transparent',
                            '--Input-focusedHighlight': 'transparent',
                            '--Input-focusedThickness': '0px',
                            boxShadow: 'none',
                            '&:focus-within': { outline: 'none', boxShadow: 'none' },
                            '& input': { outline: 'none' },
                        }}
                    />
                    {value && (
                        <IconButton
                            size="sm"
                            variant="plain"
                            onClick={() => onChange('')}
                            sx={{
                                '--IconButton-size': `${CLEAR_BUTTON_SIZE}px`,
                                mr: `${-(CLEAR_BUTTON_SIZE - CLEAR_GLYPH_SIZE) / 2}px`,
                                ml: 0,
                            }}
                        >
                            <X style={{ fontSize: CLEAR_GLYPH_SIZE }} />
                        </IconButton>
                    )}
                </Box>
            </Box>

            {showFilters && onFilterChange && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
                    {availableFilters.map((f) => (
                        <Chip
                            key={f.value}
                            variant={activeFilter === f.value ? "solid" : "soft"}
                            color={activeFilter === f.value ? "primary" : "neutral"}
                            onClick={() => onFilterChange(f.value)}
                            size="sm"
                            sx={{
                                borderRadius: 'xl',
                                fontWeight: activeFilter === f.value ? 600 : 400,
                                px: 1.5,
                                py: 0.5
                            }}
                        >
                            {f.label}
                        </Chip>
                    ))}
                </Stack>
            )}
        </Box>
    );
};
