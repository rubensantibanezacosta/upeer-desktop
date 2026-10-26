import React from 'react';
import { Box, Stack, FormControl, FormLabel, Select, Option, Typography } from '@mui/joy';
import { Palette } from 'lucide-react';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { useAppearanceStore, type AppearanceTheme, type AppearanceFontSize } from '../../../store/useAppearanceStore.js';

export const SectionApariencia: React.FC = () => {
    const theme = useAppearanceStore((s) => s.theme);
    const fontSize = useAppearanceStore((s) => s.fontSize);
    const setTheme = useAppearanceStore((s) => s.setTheme);
    const setFontSize = useAppearanceStore((s) => s.setFontSize);

    return (
        <SettingsSection
            icon={<Palette style={{ fontSize: 18 }} />}
            title="Apariencia"
            description="Ajusta cómo se ve la aplicación en este equipo."
        >
            <SettingsCard>
                <Box sx={{ px: 0.5, py: 1 }}>
                    <Stack spacing={2.5}>
                        <FormControl>
                            <FormLabel sx={{ mb: 0.75 }}>Tema</FormLabel>
                            <Select value={theme} onChange={(_, v) => v && setTheme(v as AppearanceTheme)}>
                                <Option value="dark">Oscuro</Option>
                                <Option value="light">Claro</Option>
                                <Option value="system">Seguir sistema</Option>
                            </Select>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.75 }}>
                                «Seguir sistema» cambia solo cuando cambia el tema del escritorio.
                            </Typography>
                        </FormControl>
                        <FormControl>
                            <FormLabel sx={{ mb: 0.75 }}>Tamaño de texto</FormLabel>
                            <Select value={fontSize} onChange={(_, v) => v && setFontSize(v as AppearanceFontSize)}>
                                <Option value="small">Pequeño</Option>
                                <Option value="medium">Normal</Option>
                                <Option value="large">Grande</Option>
                            </Select>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.75 }}>
                                Afecta a mensajes y listas, no a los ajustes.
                            </Typography>
                        </FormControl>
                    </Stack>
                </Box>
            </SettingsCard>
        </SettingsSection>
    );
};
