import React from 'react';
import { Box } from '@mui/joy';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';

interface MessageStatusProps {
    status: string;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status }) => {
    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            color: status === 'read' ? '#3498db' : 'text.tertiary',
        }}>
            {status === 'sent' ?
                <DoneIcon sx={{ fontSize: '14px' }} /> :
                <DoneAllIcon sx={{ fontSize: '14px' }} />
            }
        </Box>
    );
};

