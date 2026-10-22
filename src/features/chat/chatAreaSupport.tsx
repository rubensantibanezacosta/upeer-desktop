import React from 'react';
import { Box, Typography } from '@mui/joy';
import CallIcon from '@mui/icons-material/Call';
import VideocamIcon from '@mui/icons-material/Videocam';

type CallSystemEvent = { kind: 'audio' | 'video'; duration: string | null; startedAt: number | null; outcome: 'missed' | 'rejected' | null };

export function parseCallSystemEvent(message: string): CallSystemEvent | null {
    const missedMatch = /^(Llamada de voz|Videollamada) (perdida|rechazada)$/.exec(message);
    if (missedMatch) {
        return {
            kind: missedMatch[1] === 'Videollamada' ? 'video' : 'audio',
            duration: null,
            startedAt: null,
            outcome: missedMatch[2] === 'rechazada' ? 'rejected' : 'missed',
        };
    }
    const match = /^(Llamada de voz|Videollamada) · (\d{2,}:\d{2})(?: · (\d{10,}))?$/.exec(message);
    if (!match) return null;
    return { kind: match[1] === 'Videollamada' ? 'video' : 'audio', duration: match[2], startedAt: match[3] ? Number(match[3]) : null, outcome: null };
}

export const formatChatDateLabel = (date: number) => {
    const currentDate = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (currentDate.toDateString() === now.toDateString()) {
        return 'Hoy';
    }
    if (currentDate.toDateString() === yesterday.toDateString()) {
        return 'Ayer';
    }
    if (currentDate.getFullYear() === now.getFullYear()) {
        return currentDate.toLocaleDateString([], { day: '2-digit', month: 'long' });
    }
    return currentDate.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });
};

export const highlightChatMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (!element) {
        return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const sheet = element.querySelector('.MuiSheet-root');
    if (!sheet) {
        return;
    }
    sheet.classList.remove('highlight-message-active');
    void (sheet as HTMLElement).offsetWidth;
    sheet.classList.add('highlight-message-active');
};

interface ChatSystemMessageProps {
    message: string;
}

export const ChatSystemMessage: React.FC<ChatSystemMessageProps> = ({ message }) => {
    const callEvent = parseCallSystemEvent(message);
    if (callEvent) {
        const Icon = callEvent.kind === 'video' ? VideocamIcon : CallIcon;
        const label = callEvent.kind === 'video' ? 'Videollamada' : 'Llamada de voz';
        const outcome = callEvent.duration ? `Duración ${callEvent.duration}` : callEvent.outcome === 'rejected' ? 'Llamada rechazada' : 'Llamada perdida';
        const startTime = callEvent.startedAt === null
            ? null
            : new Date(callEvent.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 0.75 }}>
                <Box
                    role="note"
                    aria-label={`${label}${startTime ? `, iniciada a las ${startTime}` : ''}, ${outcome}`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 'lg', backgroundColor: 'background.level1', border: '1px solid', borderColor: 'divider', minWidth: 190 }}
                >
                    <Box sx={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', color: 'success.600', backgroundColor: 'success.softBg' }}>
                        <Icon fontSize="small" />
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>{label}</Typography>
                        {startTime && <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Inicio {startTime}</Typography>}
                        <Typography level="body-xs" sx={{ color: callEvent.duration ? 'text.tertiary' : 'danger.600' }}>{outcome}</Typography>
                    </Box>
                </Box>
            </Box>
        );
    }

    return (
    <Box sx={{ display: 'flex', justifyContent: 'center', my: 0.5 }}>
        <Typography
            level="body-xs"
            sx={{
                px: 1.5,
                py: 0.4,
                borderRadius: 'xl',
                backgroundColor: 'background.level2',
                color: 'text.tertiary',
                fontStyle: 'italic',
                userSelect: 'none',
            }}
        >
            {message}
        </Typography>
    </Box>
    );
};

interface ChatDateSeparatorProps {
    date: number;
}

export const ChatDateSeparator: React.FC<ChatDateSeparatorProps> = ({ date }) => (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 1 }}>
        <Typography
            level="body-xs"
            sx={{
                px: 2,
                py: 0.5,
                borderRadius: 'lg',
                backgroundColor: 'background.level1',
                color: 'text.secondary',
                fontWeight: 600,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
            }}
        >
            {formatChatDateLabel(date)}
        </Typography>
    </Box>
);