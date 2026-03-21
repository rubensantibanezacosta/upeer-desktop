import React from 'react';
import { Box } from '@mui/joy';

export const highlightText = (text: string, highlight: string): React.ReactNode => {
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
        <>
            {parts.map((part, i) =>
                regex.test(part) ? (
                    <Box
                        component="span"
                        key={i}
                        sx={{ color: 'primary.500', fontWeight: 700 }}
                    >
                        {part}
                    </Box>
                ) : (
                    part
                )
            )}
        </>
    );
};
