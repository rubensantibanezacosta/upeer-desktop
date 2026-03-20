import React, { useState, useEffect, useRef } from 'react';
import { IconButton, Box, Input, Typography, Tabs, TabList, Tab, Sheet } from '@mui/joy';
import MoodIcon from '@mui/icons-material/Mood';
import SearchIcon from '@mui/icons-material/Search';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { EMOJI_CATEGORIES, CATEGORY_KEYS, STORAGE_KEY } from './emojiData.js';

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    disabled?: boolean;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<number>(0);
    const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setRecentEmojis(JSON.parse(stored));
            } catch (_e) { setRecentEmojis([]); }
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const addToRecent = (emoji: string) => {
        const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 32);
        setRecentEmojis(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    };

    const handleEmojiClick = (emoji: string) => {
        addToRecent(emoji);
        onSelect(emoji);
    };

    const filteredEmojis = search.trim()
        ? Object.values(EMOJI_CATEGORIES).flatMap(c => c.emojis).filter(e => e.includes(search))
        : null;

    const currentCategory = CATEGORY_KEYS[activeTab];
    const displayEmojis = filteredEmojis || EMOJI_CATEGORIES[currentCategory]?.emojis || [];

    return (
        <Box ref={containerRef} sx={{ position: 'relative' }}>
            <IconButton
                variant="plain"
                color="neutral"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                sx={{ '&:hover': { backgroundColor: 'background.level1', color: 'primary.plainColor' } }}
            >
                <MoodIcon />
            </IconButton>

            {isOpen && (
                <Sheet
                    variant="outlined"
                    sx={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        mb: 1,
                        width: 340,
                        maxHeight: 400,
                        borderRadius: 'lg',
                        boxShadow: 'lg',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}
                >
                    <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Input
                            size="sm"
                            placeholder="Buscar emoji..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            startDecorator={<SearchIcon sx={{ fontSize: 18, opacity: 0.5 }} />}
                            sx={{ '--Input-focusedThickness': '0px', backgroundColor: 'background.level1', border: 'none' }}
                        />
                    </Box>

                    {!search && (
                        <Tabs
                            value={activeTab}
                            onChange={(_e, val) => setActiveTab(val as number)}
                            sx={{ backgroundColor: 'transparent' }}
                        >
                            <TabList
                                sx={{
                                    px: 1,
                                    gap: 0,
                                    justifyContent: 'space-between',
                                    '& .MuiTab-root': {
                                        minWidth: 32,
                                        flex: 1,
                                        py: 1,
                                        borderRadius: 0,
                                        '&:hover': { bgcolor: 'background.level1' },
                                        '&.Mui-selected': { bgcolor: 'background.level2' }
                                    }
                                }}
                            >
                                {CATEGORY_KEYS.map((key, idx) => (
                                    <Tab key={key} value={idx} sx={{ display: 'flex', justifyContent: 'center' }}>
                                        {EMOJI_CATEGORIES[key].icon}
                                    </Tab>
                                ))}
                            </TabList>
                        </Tabs>
                    )}

                    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
                        {!search && recentEmojis.length > 0 && activeTab === 0 && (
                            <Box sx={{ mb: 1.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, mb: 0.5 }}>
                                    <AccessTimeIcon sx={{ fontSize: 14, opacity: 0.6 }} />
                                    <Typography level="body-xs" sx={{ opacity: 0.6, fontWeight: 600 }}>
                                        Usados recientemente
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                                    {recentEmojis.map((emoji, i) => (
                                        <Box
                                            key={`recent-${i}`}
                                            onClick={() => handleEmojiClick(emoji)}
                                            sx={{
                                                width: 36,
                                                height: 36,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 22,
                                                cursor: 'pointer',
                                                borderRadius: 'sm',
                                                '&:hover': { bgcolor: 'background.level2' }
                                            }}
                                        >
                                            {emoji}
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {!search && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, mb: 0.5 }}>
                                {EMOJI_CATEGORIES[currentCategory].icon}
                                <Typography level="body-xs" sx={{ opacity: 0.6, fontWeight: 600 }}>
                                    {EMOJI_CATEGORIES[currentCategory].label}
                                </Typography>
                            </Box>
                        )}

                        {search && (
                            <Typography level="body-xs" sx={{ opacity: 0.6, fontWeight: 600, px: 0.5, mb: 0.5 }}>
                                Resultados de búsqueda
                            </Typography>
                        )}

                        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                            {displayEmojis.map((emoji, i) => (
                                <Box
                                    key={`${emoji}-${i}`}
                                    onClick={() => handleEmojiClick(emoji)}
                                    sx={{
                                        width: 36,
                                        height: 36,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 22,
                                        cursor: 'pointer',
                                        borderRadius: 'sm',
                                        '&:hover': { bgcolor: 'background.level2' }
                                    }}
                                >
                                    {emoji}
                                </Box>
                            ))}
                            {search && displayEmojis.length === 0 && (
                                <Typography level="body-sm" sx={{ p: 2, opacity: 0.5, textAlign: 'center', width: '100%' }}>
                                    No se encontraron emojis
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Sheet>
            )}
        </Box>
    );
};
