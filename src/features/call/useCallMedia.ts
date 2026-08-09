import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeMediaFrame, encodeMediaFrame, type CallMediaKind } from './mediaChunker.js';
import { useCallStore } from './useCallStore.js';
import { WebCodecsSession, type MediaChunk } from './webCodecsSession.js';

export type RemoteFrameHandler = (kind: CallMediaKind, frame: unknown) => void;

export function useCallMedia() {
    const call = useCallStore((s) => (s.activeCallId ? s.calls[s.activeCallId] : undefined)) ?? { phase: 'idle' as const, kind: 'audio' as const, muted: false, cameraEnabled: false };
    const sessionRef = useRef<WebCodecsSession | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const seqRef = useRef(0);
    const onDecodedRef = useRef<RemoteFrameHandler | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    const setOnRemoteFrame = useCallback((handler: RemoteFrameHandler | null) => {
        onDecodedRef.current = handler;
    }, []);

    const sendChunk = useCallback((chunk: MediaChunk) => {
        const callId = useCallStore.getState().activeCallId;
        if (!callId) {
            return;
        }
        const seq = seqRef.current++;
        const frame = encodeMediaFrame({
            kind: chunk.kind,
            ts: typeof chunk.meta?.timestamp === 'number' ? chunk.meta.timestamp : Date.now(),
            seq,
            data: chunk.bytes,
        });
        void window.upeer.sendCallMedia(callId, frame);
    }, []);

    const handleRemote = useCallback((callId: string, data: string) => {
        const frame = decodeMediaFrame(data);
        const session = sessionRef.current;
        if (!frame || !session) {
            return;
        }
        void session.decodeChunk(frame.kind, frame.data, (decoded) => {
            onDecodedRef.current?.(frame.kind, decoded);
        });
    }, []);

    useEffect(() => {
        if (call.phase !== 'negotiating' && call.phase !== 'connected') {
            return undefined;
        }
        const session = new WebCodecsSession();
        sessionRef.current = session;
        return () => {
            void session.release();
            sessionRef.current = null;
        };
    }, [call.phase]);

    useEffect(() => {
        const unsub = window.upeer?.onCallMedia?.((event) => {
            handleRemote(event.callId, event.data);
        });
        return () => {
            if (typeof unsub === 'function') {
                unsub();
            }
        };
    }, [handleRemote]);

    const startLocalCapture = useCallback(async (video: boolean): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);
            const session = sessionRef.current ?? new WebCodecsSession();
            sessionRef.current = session;
            if (stream.getAudioTracks()[0]) {
                await session.startCapture(stream, 'audio', sendChunk);
            }
            if (video && stream.getVideoTracks()[0]) {
                await session.startCapture(stream, 'video', sendChunk);
            }
            return true;
        } catch {
            return false;
        }
    }, [sendChunk]);

    const stopLocalCapture = useCallback(() => {
        void sessionRef.current?.release();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
    }, []);

    useEffect(() => {
        if (call.phase !== 'connected') {
            stopLocalCapture();
        }
    }, [call.phase, stopLocalCapture]);

    return {
        startLocalCapture,
        stopLocalCapture,
        localStream,
        setOnRemoteFrame,
        enabled: call.phase === 'connected',
    };
}

