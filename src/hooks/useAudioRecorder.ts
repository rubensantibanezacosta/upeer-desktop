import { useState, useRef, useCallback } from 'react';

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error al acceder al micrófono';

export interface AudioRecorderState {
    isRecording: boolean;
    duration: number;
    error: string | null;
    stream: MediaStream | null;
}

export const useAudioRecorder = () => {
    const [state, setState] = useState<AudioRecorderState>({
        isRecording: false,
        duration: 0,
        error: null,
        stream: null,
    });

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/ogg;codecs=opus'
            });

            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.start();
            setState({ isRecording: true, duration: 0, error: null, stream });

            timerRef.current = setInterval(() => {
                setState((prev) => ({ ...prev, duration: prev.duration + 1 }));
            }, 1000);
        } catch (error: unknown) {
            setState((prev) => ({ ...prev, error: getErrorMessage(error) }));
        }
    }, []);

    const stopRecording = useCallback((): Promise<File | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
                resolve(null);
                return;
            }

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType });
                const extension = mediaRecorderRef.current?.mimeType.includes('webm') ? 'webm' : 'ogg';
                const file = new File([blob], `voice_note_${Date.now()}.${extension}`, { type: blob.type });

                // Detener todos los tracks del stream
                mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());

                resolve(file);
            };

            mediaRecorderRef.current.stop();
            if (timerRef.current) clearInterval(timerRef.current);
            setState((prev) => ({ ...prev, isRecording: false, stream: null }));
        });
    }, []);

    const cancelRecording = useCallback(() => {
        if (!mediaRecorderRef.current) return;

        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

        if (timerRef.current) clearInterval(timerRef.current);
        setState({ isRecording: false, duration: 0, error: null, stream: null });
        chunksRef.current = [];
    }, []);

    return {
        ...state,
        startRecording,
        stopRecording,
        cancelRecording
    };
};
