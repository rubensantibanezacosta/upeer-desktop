import React from 'react';
import { Box, Input, IconButton } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';

export const SidebarSearch: React.FC = () => (
    <Box sx={{ p: 1, px: 1.5, display: 'flex', gap: 1, alignItems: 'center', backgroundColor: 'background.surface' }}>
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'background.level1',
            borderRadius: '8px',
            px: 1,
            flexGrow: 1,
            height: '35px'
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
                }}
            />
        </Box>
        <IconButton size="sm" variant="plain" color="neutral"><FilterListIcon /></IconButton>
    </Box>
);
