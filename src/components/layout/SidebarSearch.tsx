import React, { useState } from 'react';
import { Box, Input, IconButton, Chip, Stack } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';

interface SidebarSearchProps {
    activeFilter: string;
    onFilterChange: (filter: string) => void;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({ activeFilter, onFilterChange }) => {
    const filters = [
        { label: 'Todos', value: 'all' },
        { label: 'No leídos', value: 'unread' },
        { label: 'Favoritos', value: 'favorites' },
        { label: 'Grupos', value: 'groups' }
    ];

    return (
        <Box sx={{ p: 1, px: 1.5, display: 'flex', flexDirection: 'column', gap: 1, backgroundColor: 'background.surface' }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'background.level1',
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    px: 1,
                    flexGrow: 1,
                    height: '35px',
                    transition: 'border-color 0.15s',
                    '&:focus-within': {
                        borderColor: 'var(--joy-palette-primary-300)',
                    },
                }}>
                    <SearchIcon sx={{ color: 'text.tertiary', fontSize: '18px', mr: 1 }} />
                    <Input
                        size="sm"
                        placeholder="Buscar un chat o iniciar uno nuevo"
                        variant="plain"
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
                </Box>
                <IconButton size="sm" variant="plain" color="neutral"><FilterListIcon /></IconButton>
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 0.5, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
                {filters.map((f) => (
                    <Chip
                        key={f.value}
                        variant={activeFilter === f.value ? "solid" : "soft"}
                        color={activeFilter === f.value ? "primary" : "neutral"}
                        onClick={() => onFilterChange(f.value)}
                        size="sm"
                        sx={{
                            borderRadius: 'xl',
                            fontWeight: activeFilter === f.value ? 600 : 400,
                            px: 1.5
                        }}
                    >
                        {f.label}
                    </Chip>
                ))}
            </Stack>
        </Box>
    );
};
