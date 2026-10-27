import React from 'react';
import { Box, Sheet } from '@mui/joy';
import { Mic } from 'lucide-react';
import type { ConversationActivity } from '../../../types/chat.js';
import { BUBBLE_RADIUS } from './bubbleShape.js';

interface TypingIndicatorProps {
    activity: ConversationActivity;
}

const DOT_DELAYS = ['0ms', '160ms', '320ms'];

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ activity }) => {
    const isRecording = activity === 'recording';
    const label = isRecording ? 'Grabando nota de voz' : 'Escribiendo';

    return (
        <Box
            className="chat-bubble-enter"
            role="status"
            aria-live="polite"
            aria-label={label}
            data-testid="chat-activity"
            sx={{
                alignSelf: 'flex-start',
                display: 'flex',
                justifyContent: 'flex-start',
                width: '100%',
                mb: 1,
                transformOrigin: 'left bottom',
            }}
        >
            <Sheet
                variant="soft"
                color="neutral"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: isRecording ? 1 : 0.5,
                    minWidth: isRecording ? 52 : 58,
                    height: isRecording ? 40 : 34,
                    borderRadius: `${BUBBLE_RADIUS}px`,
                    px: 1.5,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.2)',
                }}
            >
                {isRecording ? (
                    <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', width: 26, height: 26 }}>
                        <Box
                            component="span"
                            className="chat-recording-icon"
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                borderRadius: '50%',
                                border: '2px solid',
                                borderColor: 'danger.500',
                                animation: 'chat-recording-ring 1.4s infinite ease-out',
                            }}
                        />
                        <Box
                            component="span"
                            className="chat-recording-icon"
                            sx={{
                                display: 'grid',
                                placeItems: 'center',
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                color: 'danger.plainColor',
                                backgroundColor: 'danger.softBg',
                                animation: 'chat-recording-pulse 1.1s infinite ease-in-out',
                            }}
                        >
                            <Mic style={{ fontSize: 14 }} />
                        </Box>
                    </Box>
                ) : (
                    DOT_DELAYS.map((delay) => (
                        <Box
                            key={delay}
                            component="span"
                            data-testid="typing-dot"
                            className="chat-typing-dot"
                            sx={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                backgroundColor: 'text.tertiary',
                                animation: 'chat-typing-dot 1.2s infinite ease-in-out',
                                animationDelay: delay,
                            }}
                        />
                    ))
                )}
            </Sheet>
        </Box>
    );
};
