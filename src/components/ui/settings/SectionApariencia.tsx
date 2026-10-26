import React from 'react';
import { Box, Typography } from '@mui/joy';
import { Palette, SunMoon, ALargeSmall, Check } from 'lucide-react';
import { CardGroupLabel, SettingsCard, SettingsSection } from './sectionShell.js';
import { useAppearanceStore, type AppearanceTheme, type AppearanceFontSize } from '../../../store/useAppearanceStore.js';

const PREVIEW_BARS = [72, 44, 60];

const THEME_OPTIONS: Array<{ value: AppearanceTheme; label: string }> = [
    { value: 'dark', label: 'Oscuro' },
    { value: 'light', label: 'Claro' },
    { value: 'system', label: 'Sistema' },
];

const FONT_OPTIONS: Array<{ value: AppearanceFontSize; label: string; size: number }> = [
    { value: 'small', label: 'Pequeño', size: 15 },
    { value: 'medium', label: 'Normal', size: 19 },
    { value: 'large', label: 'Grande', size: 23 },
];

const ThemePreview: React.FC<{ variant: AppearanceTheme }> = ({ variant }) => {
    const tones: Array<'dark' | 'light'> = variant === 'system' ? ['dark', 'light'] : [variant];
    return (
        <Box
            sx={{
                display: 'flex',
                width: '100%',
                height: 52,
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
            }}
        >
            {tones.map((tone) => (
                <Box
                    key={tone}
                    sx={{
                        flex: 1,
                        backgroundColor: tone === 'dark' ? '#0f141b' : '#eef1f6',
                        px: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: 0.5,
                    }}
                >
                    {PREVIEW_BARS.map((width, index) => (
                        <Box
                            key={index}
                            sx={{
                                width: `${width}%`,
                                height: 4,
                                borderRadius: '3px',
                                backgroundColor: index === 0
                                    ? tone === 'dark' ? '#8bb4ff' : '#3b82f6'
                                    : tone === 'dark' ? '#2b3542' : '#c7d0dd',
                            }}
                        />
                    ))}
                </Box>
            ))}
        </Box>
    );
};

interface OptionTileProps {
    selected: boolean;
    label: string;
    onSelect: () => void;
    children: React.ReactNode;
}

const OptionTile: React.FC<OptionTileProps> = ({ selected, label, onSelect, children }) => (
    <Box
        component="button"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        sx={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            p: 1,
            font: 'inherit',
            borderRadius: '12px',
            border: '1px solid',
            borderColor: selected ? 'primary.500' : 'divider',
            backgroundColor: selected ? 'primary.softBg' : 'transparent',
            color: 'text.primary',
            cursor: 'pointer',
            transition: 'border-color 0.16s ease, background-color 0.16s ease',
            '&:hover': { borderColor: selected ? 'primary.400' : 'neutral.600' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.400', outlineOffset: '2px' },
        }}
    >
        {children}
        <Typography
            level="body-xs"
            sx={{ mt: 1, fontWeight: 600, color: selected ? 'primary.plainColor' : 'text.secondary' }}
        >
            {label}
        </Typography>
        {selected && (
            <Box
                sx={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: 'primary.500',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'background.body',
                }}
            >
                <Check style={{ fontSize: 11 }} />
            </Box>
        )}
    </Box>
);

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
                <CardGroupLabel
                    icon={<SunMoon style={{ fontSize: 15 }} />}
                    title="Tema"
                    description="«Seguir sistema» cambia solo cuando cambia el tema del escritorio."
                />
                <Box sx={{ display: 'flex', gap: 1.25, px: 0.5, pb: 1 }}>
                    {THEME_OPTIONS.map((option) => (
                        <OptionTile
                            key={option.value}
                            label={option.label}
                            selected={theme === option.value}
                            onSelect={() => setTheme(option.value)}
                        >
                            <ThemePreview variant={option.value} />
                        </OptionTile>
                    ))}
                </Box>
            </SettingsCard>

            <SettingsCard>
                <CardGroupLabel
                    icon={<ALargeSmall style={{ fontSize: 15 }} />}
                    title="Tamaño de texto"
                    description="Afecta a mensajes y listas, no a los ajustes."
                />
                <Box sx={{ display: 'flex', gap: 1.25, px: 0.5, pb: 1 }}>
                    {FONT_OPTIONS.map((option) => (
                        <OptionTile
                            key={option.value}
                            label={option.label}
                            selected={fontSize === option.value}
                            onSelect={() => setFontSize(option.value)}
                        >
                            <Box
                                sx={{
                                    height: 52,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '8px',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: option.size,
                                        fontWeight: 600,
                                        color: fontSize === option.value ? 'primary.plainColor' : 'text.secondary',
                                    }}
                                >
                                    Aa
                                </Typography>
                            </Box>
                        </OptionTile>
                    ))}
                </Box>
            </SettingsCard>
        </SettingsSection>
    );
};
