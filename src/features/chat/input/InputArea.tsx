import React, { useState } from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import { AttachmentButton, AttachmentType } from './AttachmentButton.js';
import { EmojiPicker } from './EmojiPicker.js';
import { RecordingBar } from './RecordingBar.js';
import { ReplyBar } from './ReplyBar.js';
import { RichInput } from './RichInput.js';
import { LinkPreviewCard } from '../message/LinkPreviewCard.js';
import { useAudioRecorder } from '../../../hooks/useAudioRecorder.js';
import { useRecordingWaveform } from '../../../hooks/useRecordingWaveform.js';
import { useInputPreview } from '../../../hooks/useInputPreview.js';
import type { LinkPreview } from '../../../types/chat.js';

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error al enviar la nota de voz';

interface InputAreaProps {
    message: string;
    setMessage: (msg: string) => void;
    onSend: (linkPreview?: LinkPreview | null) => void | Promise<void>;
    onTyping?: () => void;
    disabled: boolean;
    replyToMessage?: { id?: string; message: string; isMine: boolean; senderName?: string } | null;
    onCancelReply?: () => void;
    editingMessage?: { id?: string; message: string } | null;
    onCancelEdit?: () => void;
    onAttachFile?: (type: AttachmentType) => void;
    allowContactShare?: boolean;
    onScrollToMessage?: (msgId: string) => void;
    onSendVoiceNote?: (file: File) => Promise<void>;
    focusKey?: string;
}

export const InputArea: React.FC<InputAreaProps> = ({
    message, setMessage, onSend, onTyping, disabled,
    replyToMessage, onCancelReply, editingMessage, onCancelEdit,
    onAttachFile, allowContactShare = false, onScrollToMessage, onSendVoiceNote, focusKey
}) => {
    const { isRecording, duration, stream, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
    const canvasRef = useRecordingWaveform(isRecording, stream);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const { linkPreview, isLoadingPreview, dismissPreview } = useInputPreview(message);

    const handleChange = (val: string) => {
        setMessage(val);
        if (onTyping) onTyping();
    };

    const handleSendClick = () => onSend(linkPreview);

    const handleMicClick = async () => {
        if (!isRecording) {
            setVoiceError(null);
            await startRecording();
        } else {
            const file = await stopRecording();
            if (file && onSendVoiceNote) {
                setIsSending(true);
                setVoiceError(null);
                try {
                    await onSendVoiceNote(file);
                } catch (error: unknown) {
                    setVoiceError(getErrorMessage(error));
                } finally {
                    setIsSending(false);
                }
            }
        }
    };

    const showPreviewBar = !isRecording && (linkPreview !== null || isLoadingPreview);

    return (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', backgroundColor: 'background.surface', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
            {replyToMessage && (
                <ReplyBar replyToMessage={replyToMessage} onCancel={onCancelReply!} onScrollTo={onScrollToMessage} />
            )}

            {editingMessage && (
                <Box sx={{ p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5, backgroundColor: 'background.level1', borderLeft: '4px solid', borderColor: 'warning.main', mx: 2, mt: 1, borderRadius: '4px' }}>
                    <EditIcon sx={{ fontSize: '18px', color: 'warning.main' }} />
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'warning.main' }}>Editando mensaje</Typography>
                        <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>{editingMessage.message}</Typography>
                    </Box>
                    <IconButton size="sm" variant="plain" color="neutral" onClick={onCancelEdit}>
                        <CloseIcon sx={{ fontSize: '18px' }} />
                    </IconButton>
                </Box>
            )}

            {voiceError && (
                <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'danger.softBg', mx: 2, mt: 1, borderRadius: '4px' }}>
                    <Typography level="body-xs" sx={{ color: 'danger.plainColor' }}>{voiceError}</Typography>
                    <IconButton size="sm" variant="plain" color="danger" onClick={() => setVoiceError(null)}>
                        <CloseIcon sx={{ fontSize: '14px' }} />
                    </IconButton>
                </Box>
            )}

            {showPreviewBar && (
                <Box sx={{ mx: 2, mt: 1, p: 1.5, backgroundColor: 'background.level1', borderRadius: 'md', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {isLoadingPreview && (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Cargando vista previa…</Typography>
                    )}
                    {linkPreview && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <LinkPreviewCard data={linkPreview} />
                            </Box>
                            <IconButton size="sm" variant="plain" color="neutral" onClick={dismissPreview} sx={{ flexShrink: 0 }}>
                                <CloseIcon sx={{ fontSize: '14px' }} />
                            </IconButton>
                        </Box>
                    )}
                </Box>
            )}

            <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1.5, alignItems: 'center', height: '62px', boxSizing: 'border-box' }}>
                {isRecording ? (
                    <RecordingBar duration={duration} onCancel={cancelRecording} onSend={handleMicClick} disabled={disabled} isSending={isSending} canvasRef={canvasRef} />
                ) : (
                    <>
                        <EmojiPicker onSelect={(emoji) => setMessage(message + emoji)} disabled={disabled} />
                        <AttachmentButton onSelect={(type) => { if (onAttachFile) onAttachFile(type); }} disabled={disabled} allowContactShare={allowContactShare} />
                        <RichInput
                            value={message}
                            onChange={handleChange}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendClick()}
                            placeholder={editingMessage ? 'Edita tu mensaje...' : 'Escribe un mensaje...'}
                            autoComplete="off"
                            disabled={disabled}
                            autoFocus={!disabled}
                            focusKey={focusKey}
                        />
                        <IconButton variant="plain" color="neutral" onClick={message ? handleSendClick : handleMicClick} disabled={disabled}>
                            {message
                                ? (editingMessage ? <SendIcon color="warning" /> : <SendIcon color="primary" />)
                                : <MicIcon color="primary" />
                            }
                        </IconButton>
                    </>
                )}
            </Box>
        </Box>
    );
};
