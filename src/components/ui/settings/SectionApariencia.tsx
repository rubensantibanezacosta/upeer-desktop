import React, { useState } from 'react';
import { Box, Stack, FormControl, FormLabel, Select, Option } from '@mui/joy';

export const SectionApariencia: React.FC = () => {
    const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
    const [fontSize, setFontSize] = useState('medium');

    return (
        <Box sx={{ px: 1.5, py: 2 }}>
            <Stack spacing={2.5}>
                <FormControl>
                    <FormLabel>Tema</FormLabel>
                    <Select value={theme} onChange={(_, v) => v && setTheme(v as typeof theme)}>
                        <Option value="dark">Oscuro</Option>
                        <Option value="light">Claro</Option>
                        <Option value="system">Seguir sistema</Option>
                    </Select>
                </FormControl>
                <FormControl>
                    <FormLabel>Tamaño de texto</FormLabel>
                    <Select value={fontSize} onChange={(_, v) => v && setFontSize(v as string)}>
                        <Option value="small">Pequeño</Option>
                        <Option value="medium">Normal</Option>
                        <Option value="large">Grande</Option>
                    </Select>
                </FormControl>
            </Stack>
        </Box>
    );
};
