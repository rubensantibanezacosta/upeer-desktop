import React, { useState, useEffect, useRef } from 'react';
import { IconButton, Box, Input, Typography, Tabs, TabList, Tab, Sheet } from '@mui/joy';
import { Smile, Search, Clock } from 'lucide-react';
import { EMOJI_CATEGORIES, RECENT_KEY, RECENT_LABEL, STORAGE_KEY, TAB_KEYS, pushRecentEmoji, searchEmojis } from './emojiData.js';
import { CHAT_COMPOSER_ICON_SIZE } from './composerLayout.js';
import { COMPOSER_ACTION_BUTTON_SX } from './composerActions.js';

const keepComposerFocus = (event: React.MouseEvent) => event.preventDefault();

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    onFocusComposer?: () => void;
    disabled?: boolean;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onFocusComposer, disabled = false }) => {
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
        const updated = pushRecentEmoji(recentEmojis, emoji);
        setRecentEmojis(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    };

    const handleEmojiClick = (emoji: string) => {
        addToRecent(emoji);
        onSelect(emoji);
    };

    const filteredEmojis = search.trim() ? searchEmojis(search) : null;

    const currentCategory = TAB_KEYS[activeTab] ?? RECENT_KEY;
    const isRecentTab = currentCategory === RECENT_KEY;
    const displayEmojis = filteredEmojis ?? (isRecentTab ? recentEmojis : EMOJI_CATEGORIES[currentCategory]?.emojis ?? []);
    const currentLabel = isRecentTab ? RECENT_LABEL : EMOJI_CATEGORIES[currentCategory]?.label ?? '';
    const currentIcon = isRecentTab ? React.createElement(Clock, { style: { fontSize: 14 } }) : EMOJI_CATEGORIES[currentCategory]?.icon;

    return (
        <Box ref={containerRef} sx={{ position: 'relative' }}>
            <IconButton
                aria-label="Abrir emojis"
                variant="plain"
                color="neutral"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                onMouseDown={keepComposerFocus}
                sx={{ ...COMPOSER_ACTION_BUTTON_SX, '&:hover': { backgroundColor: 'background.level2', color: 'primary.plainColor' } }}
            >
                <Smile size={CHAT_COMPOSER_ICON_SIZE} />
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
                            startDecorator={<Search style={{ fontSize: 18, opacity: 0.5 }} />}
                            sx={{ '--Input-focusedThickness': '0px', backgroundColor: 'background.level1', border: 'none' }}
                        />
                    </Box>

                    {!search && (
                        <Tabs
                            value={activeTab}
                            onChange={(_e, val) => {
                                setActiveTab(val as number);
                                onFocusComposer?.();
                            }}
                            sx={{ backgroundColor: 'transparent' }}
                        >
                            <TabList
                                onMouseDown={keepComposerFocus}
                                sx={{
                                    px: 1,
                                    py: 0.5,
                                    gap: 0.5,
                                    flexWrap: 'nowrap',
                                    overflowX: 'auto',
                                    scrollbarWidth: 'none',
                                    '&::-webkit-scrollbar': { display: 'none' },
                                    '& .MuiTab-root': {
                                        minWidth: 34,
                                        minHeight: 34,
                                        flex: '0 0 auto',
                                        px: 1,
                                        py: 0,
                                        borderRadius: 'sm',
                                        '&:hover': { bgcolor: 'background.level1' },
                                        '&.Mui-selected': { bgcolor: 'background.level2' }
                                    }
                                }}
                            >
                                {TAB_KEYS.map((key, idx) => (
                                    <Tab key={key} value={idx} aria-label={key === RECENT_KEY ? RECENT_LABEL : EMOJI_CATEGORIES[key].label} sx={{ display: 'flex', justifyContent: 'center' }}>
                                        {key === RECENT_KEY ? <Clock style={{ fontSize: 18 }} /> : EMOJI_CATEGORIES[key].icon}
                                    </Tab>
                                ))}
                            </TabList>
                        </Tabs>
                    )}

                    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
                        {!search && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, mb: 0.5 }}>
                                {currentIcon}
                                <Typography level="body-xs" sx={{ opacity: 0.6, fontWeight: 600 }}>
                                    {currentLabel}
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
                                    onMouseDown={keepComposerFocus}
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
                            {displayEmojis.length === 0 && (
                                <Typography level="body-sm" sx={{ p: 2, opacity: 0.5, textAlign: 'center', width: '100%' }}>
                                    {search ? 'No se encontraron emojis' : 'Todavía no has usado ningún emoji'}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Sheet>
            )}
        </Box>
    );
};
