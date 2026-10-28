import React from 'react';
import { Box, Typography } from '@mui/joy';
import { Timer } from 'lucide-react';
import { retentionNotice } from '../../../utils/retention.js';

interface ChatRetentionNoticeProps {
    retention?: string | null;
}

export const ChatRetentionNotice: React.FC<ChatRetentionNoticeProps> = ({ retention }) => {
    const text = retentionNotice(retention);
    if (!text) return null;

    return (
        <Box
            data-retention-notice
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.75, py: 1, flexShrink: 0 }}
        >
            <Timer style={{ fontSize: 14 }} />
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {text}
            </Typography>
        </Box>
    );
};
