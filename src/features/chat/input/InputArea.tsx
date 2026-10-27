import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import { Camera, Send, Mic, Pencil, X } from 'lucide-react';
import { AttachmentButton, AttachmentType } from './AttachmentButton.js';
import { CameraCaptureOverlay } from '../file-preview/CameraCaptureOverlay.js';
import { EmojiPicker } from './EmojiPicker.js';
import { RecordingBar } from './RecordingBar.js';
import { ReplyBar } from './ReplyBar.js';
import { RichInput, type RichInputHandle } from './RichInput.js';
import { LinkPreviewCard } from '../message/LinkPreviewCard.js';
import { useAudioRecorder } from '../../../hooks/useAudioRecorder.js';
import { useRecordingWaveform } from '../../../hooks/useRecordingWaveform.js';
import { useInputPreview } from '../../../hooks/useInputPreview.js';
import { CHAT_COMPOSER_BAR_HEIGHT, CHAT_COMPOSER_ICON_SIZE, CHAT_COMPOSER_OVERLAY_GAP, CHAT_COMPOSER_PILL_HEIGHT, CHAT_COMPOSER_PILL_PADDING, CHAT_COMPOSER_SEND_SIZE, CHAT_COMPOSER_STAGE_PADDING } from './composerLayout.js';
import { COMPOSER_ACTION_BUTTON_SX } from './composerActions.js';
import { INPUT_PILL_RADIUS } from '../../../inputShape.js';
import type { ConversationActivitySignal, LinkPreview } from '../../../types/chat.js';

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error al enviar la nota de voz';

interface InputAreaProps {
    message: string;
    setMessage: (msg: string) => void;
    onSend: (linkPreview?: LinkPreview | null) => void | Promise<void>;
    onActivity?: (state: ConversationActivitySignal) => void;
    disabled: boolean;
    replyToMessage?: { id?: string; message: string; isMine: boolean; senderName?: string } | null;
    onCancelReply?: () => void;
    editingMessage?: { id?: string; message: string } | null;
    onCancelEdit?: () => void;
    onAttachFile?: (type: AttachmentType) => void;
    onCapturePhoto?: (dataUrl: string) => void | Promise<void>;
    allowContactShare?: boolean;
    onScrollToMessage?: (msgId: string) => void;
    onSendVoiceNote?: (file: File) => Promise<void>;
    focusKey?: string;
}

export const InputArea: React.FC<InputAreaProps> = ({
    message, setMessage, onSend, onActivity, disabled,
    replyToMessage, onCancelReply, editingMessage, onCancelEdit,
    onAttachFile, allowContactShare = false, onScrollToMessage, onSendVoiceNote, focusKey, onCapturePhoto
}) => {
    const { isRecording, duration, stream, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
    const canvasRef = useRecordingWaveform(isRecording, stream);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [shots, setShots] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);
    const { linkPreview, isLoadingPreview, dismissPreview } = useInputPreview(message);
    const [layer, setLayer] = useState<HTMLElement | null>(null);
    const richInputRef = useRef<RichInputHandle | null>(null);
    const composerRef = useRef<HTMLDivElement | null>(null);
    const activityRef = useRef(onActivity);
    activityRef.current = onActivity;

    useEffect(() => {
        if (!isRecording) return;
        activityRef.current?.('recording');
        const heartbeat = setInterval(() => activityRef.current?.('recording'), 2000);
        return () => {
            clearInterval(heartbeat);
            activityRef.current?.('stop');
        };
    }, [isRecording]);

    const attachLayer = useCallback((node: HTMLDivElement | null) => {
        composerRef.current = node;
        const parent = node?.parentElement ?? null;
        setLayer((current) => (current === parent ? current : parent));
    }, []);

    useEffect(() => {
        const node = composerRef.current;
        if (!node) return;
        const sync = () => {
            document.documentElement.style.setProperty('--upeer-composer-height', `${node.offsetHeight + CHAT_COMPOSER_OVERLAY_GAP}px`);
        };
        sync();
        if (typeof ResizeObserver === 'undefined') return () => document.documentElement.style.removeProperty('--upeer-composer-height');
        const observer = new ResizeObserver(sync);
        observer.observe(node);
        return () => {
            observer.disconnect();
            document.documentElement.style.removeProperty('--upeer-composer-height');
        };
    }, []);

    const handleChange = (val: string) => {
        setMessage(val);
        if (onActivity) onActivity('typing');
    };

    const handleSendClick = () => {
        onSend(linkPreview);
        if (onActivity) onActivity('stop');
    };

    const openCamera = () => {
        setShots([]);
        setCameraOpen(true);
    };

    const closeCamera = () => {
        setCameraOpen(false);
        setShots([]);
    };

    const handleCapture = (dataUrl: string) => {
        setShots((current) => [...current, dataUrl]);
        void onCapturePhoto?.(dataUrl);
    };

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
        <Box ref={attachLayer} sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            boxSizing: 'border-box',
        }}>
            {replyToMessage && (
                <ReplyBar replyToMessage={replyToMessage} onCancel={onCancelReply ?? (() => {})} onScrollTo={onScrollToMessage} />
            )}

            {editingMessage && (
                <Box sx={{ p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5, backgroundColor: 'background.level1', borderLeft: '4px solid', borderColor: 'warning.main', mx: 2, mt: 1, borderRadius: '4px' }}>
                    <Pencil style={{ fontSize: 18, color: 'var(--joy-palette-warning-main)' }} />
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'warning.main' }}>Editando mensaje</Typography>
                        <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>{editingMessage.message}</Typography>
                    </Box>
                    <IconButton size="sm" variant="plain" color="neutral" onClick={onCancelEdit}>
                        <X style={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
            )}

            {voiceError && (
                <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'danger.softBg', mx: 2, mt: 1, borderRadius: '4px' }}>
                    <Typography level="body-xs" sx={{ color: 'danger.plainColor' }}>{voiceError}</Typography>
                    <IconButton size="sm" variant="plain" color="danger" onClick={() => setVoiceError(null)}>
                        <X style={{ fontSize: 14 }} />
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
                                <X style={{ fontSize: 14 }} />
                            </IconButton>
                        </Box>
                    )}
                </Box>
            )}

            <Box sx={{ px: 2, py: `${CHAT_COMPOSER_STAGE_PADDING}px`, display: 'flex', alignItems: 'center', gap: 0.5, minHeight: `${CHAT_COMPOSER_BAR_HEIGHT}px`, boxSizing: 'border-box' }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    flex: 1,
                    minWidth: 0,
                    minHeight: CHAT_COMPOSER_PILL_HEIGHT,
                    px: `${CHAT_COMPOSER_PILL_PADDING}px`,
                    borderRadius: INPUT_PILL_RADIUS,
                    backgroundColor: 'background.level1',
                }}>
                    {isRecording ? (
                        <RecordingBar duration={duration} onCancel={cancelRecording} canvasRef={canvasRef} />
                    ) : (
                        <>
                            <EmojiPicker onSelect={(emoji) => richInputRef.current?.insertText(emoji)} onFocusComposer={() => richInputRef.current?.focus()} disabled={disabled} />
                            <RichInput
                                ref={richInputRef}
                                value={message}
                                onChange={handleChange}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && handleSendClick()}
                                placeholder={editingMessage ? 'Edita tu mensaje...' : 'Escribe un mensaje'}
                                autoComplete="off"
                                disabled={disabled}
                                autoFocus={!disabled}
                                focusKey={focusKey}
                                embedded
                            />
                            <AttachmentButton onSelect={(type) => { if (onAttachFile) onAttachFile(type); }} disabled={disabled} allowContactShare={allowContactShare} />
                            <IconButton
                                aria-label="Abrir cámara"
                                variant="plain"
                                color="neutral"
                                onClick={openCamera}
                                disabled={disabled || !onCapturePhoto}
                                sx={{ ...COMPOSER_ACTION_BUTTON_SX, '&:hover': { backgroundColor: 'background.level2', color: 'primary.plainColor' } }}
                            >
                                <Camera size={CHAT_COMPOSER_ICON_SIZE} />
                            </IconButton>
                        </>
                    )}
                </Box>
                <IconButton
                    aria-label={isRecording ? 'Enviar nota de voz' : message ? 'Enviar mensaje' : 'Grabar nota de voz'}
                    variant="plain"
                    color="neutral"
                    onClick={message && !isRecording ? handleSendClick : handleMicClick}
                    disabled={disabled || (isRecording && isSending)}
                    sx={{
                        '--IconButton-size': `${CHAT_COMPOSER_SEND_SIZE}px`,
                        minWidth: CHAT_COMPOSER_SEND_SIZE,
                        minHeight: CHAT_COMPOSER_SEND_SIZE,
                        paddingInline: 0,
                        flexShrink: 0,
                        '&:hover': { backgroundColor: 'background.level2' },
                    }}
                >
                    {isRecording
                        ? (isSending
                            ? <Typography level="body-xs" sx={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>…</Typography>
                            : <Send size={CHAT_COMPOSER_ICON_SIZE} style={{ color: 'var(--joy-palette-primary-main)' }} />)
                        : message
                            ? (editingMessage
                                ? <Send size={CHAT_COMPOSER_ICON_SIZE} style={{ color: 'var(--joy-palette-warning-main)' }} />
                                : <Send size={CHAT_COMPOSER_ICON_SIZE} style={{ color: 'var(--joy-palette-primary-main)' }} />)
                            : <Mic size={CHAT_COMPOSER_ICON_SIZE} style={{ color: 'var(--joy-palette-primary-main)' }} />
                    }
                </IconButton>
            </Box>
            <CameraCaptureOverlay
                open={cameraOpen}
                shots={shots}
                onCapture={handleCapture}
                onClose={closeCamera}
                container={layer}
            />
        </Box>
    );
};
