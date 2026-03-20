import React from 'react';
import { Box, Typography } from '@mui/joy';
import LanguageIcon from '@mui/icons-material/Language';
import ImageIcon from '@mui/icons-material/Image';
import type { LinkPreview } from '../../../types/chat.js';

interface LinkPreviewCardProps {
    data: LinkPreview;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ data }) => {
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.upeer?.openExternal?.(data.url);
    };

    return (
        <Box
            onClick={handleClick}
            sx={{
                cursor: 'pointer',
                width: '100%',
                borderRadius: 'sm',
                overflow: 'hidden',
                bgcolor: 'background.level2',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                '&:hover': { bgcolor: 'background.level3' },
                transition: 'background-color 0.15s',
            }}
        >
            <Box sx={{ width: 80, flexShrink: 0, bgcolor: 'background.level3', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {data.imageBase64 ? (
                    <Box
                        component="img"
                        src={data.imageBase64}
                        alt={data.title ?? ''}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                ) : (
                    <ImageIcon sx={{ fontSize: 28, color: 'text.tertiary', opacity: 0.4 }} />
                )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, px: 1.5, py: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                    <LanguageIcon sx={{ fontSize: 11, color: 'text.tertiary', flexShrink: 0 }} />
                    <Typography
                        level="body-xs"
                        sx={{ color: 'text.tertiary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {data.domain ?? data.url}
                    </Typography>
                </Box>
                {data.title && (
                    <Typography
                        level="body-sm"
                        sx={{
                            fontWeight: 'lg',
                            color: 'text.primary',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word',
                            lineHeight: 1.3,
                            mb: data.description ? 0.25 : 0,
                        }}
                    >
                        {data.title}
                    </Typography>
                )}
                {data.description && (
                    <Typography
                        level="body-xs"
                        sx={{
                            color: 'text.secondary',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word',
                            lineHeight: 1.3,
                        }}
                    >
                        {data.description}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};
