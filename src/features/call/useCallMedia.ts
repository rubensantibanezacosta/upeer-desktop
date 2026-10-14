import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeMediaFrame, encodeMediaFrame, type CallMediaKind } from './mediaChunker.js';
import { useCallStore } from './useCallStore.js';
import { WebCodecsSession, type MediaChunk } from './webCodecsSession.js';

type ScreenCaptureOptions = { target: 'screen' | 'window'; withSystemAudio: boolean };
export type RemoteFrameHandler = (kind: CallMediaKind, frame: unknown, peerUpeerId: string) => void;

const remoteMediaDiagnostics = new Set<string>();

export function useCallMedia(callId: string) {
    const call = useCallStore((state) => state.calls[callId]);
    const captureActive = call?.phase === 'negotiating' || call?.phase === 'connected';
    const sessionRef = useRef<WebCodecsSession | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const captureGenerationRef = useRef(0);
    const screenRef = useRef<MediaStream | null>(null);
    const sequenceRef = useRef<Record<CallMediaKind, number>>({ audio: 0, video: 0, screen: 0 });
    const onRemoteFrameRef = useRef<RemoteFrameHandler | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [screenSharing, setScreenSharing] = useState(false);

    const setOnRemoteFrame = useCallback((handler: RemoteFrameHandler | null) => {
        onRemoteFrameRef.current = handler;
    }, []);

    const sendChunk = useCallback((chunk: MediaChunk) => {
        const frame = encodeMediaFrame({
            kind: chunk.kind,
            ts: chunk.timestamp,
            seq: sequenceRef.current[chunk.kind]++,
            keyFrame: chunk.keyFrame,
            data: chunk.bytes,
        });
        void window.upeer.sendCallMedia(callId, frame);
    }, [callId]);

    const handleRemoteMedia = useCallback((event: { callId: string; peerUpeerId: string; senderUpeerId?: string; data: Uint8Array }) => {
        if (event.callId !== callId) {
            logRemoteMediaDiagnostic(`${event.callId}:call-id-mismatch`, 'Remote CALL_MEDIA does not match this call window', { expectedCallId: callId, receivedCallId: event.callId, peerUpeerId: event.peerUpeerId });
            return;
        }
        const frame = decodeMediaFrame(event.data);
        const session = sessionRef.current;
        if (!frame) {
            logRemoteMediaDiagnostic(`${callId}:invalid-media-frame`, 'Remote CALL_MEDIA payload is not a valid media frame', { callId, peerUpeerId: event.peerUpeerId, mediaBytes: event.data.byteLength });
            return;
        }
        if (!session) {
            logRemoteMediaDiagnostic(`${callId}:decoder-session-missing`, 'Remote CALL_MEDIA received without an active decoder session', { callId, peerUpeerId: event.peerUpeerId });
            return;
        }
        const streamId = event.senderUpeerId ?? event.peerUpeerId;
        const diagnosticKey = `${callId}:${streamId}:${frame.kind}`;
        logRemoteMediaDiagnostic(`${diagnosticKey}:frame-received`, 'Remote CALL_MEDIA frame passed renderer parsing and was queued for decode', { callId, peerUpeerId: streamId, kind: frame.kind, mediaBytes: frame.data.byteLength, keyFrame: frame.keyFrame });
        void session.decodeChunk(frame.kind, frame.data, frame.ts, frame.keyFrame ?? true, (decoded) => {
            logRemoteMediaDiagnostic(`${diagnosticKey}:frame-decoded`, 'Remote CALL_MEDIA frame decoded by WebCodecs', { callId, peerUpeerId: streamId, kind: frame.kind });
            onRemoteFrameRef.current?.(frame.kind, decoded, streamId);
        }, streamId).catch((cause: unknown) => {
            logRemoteMediaDiagnostic(`${diagnosticKey}:decode-failed`, 'Remote CALL_MEDIA frame could not be queued for WebCodecs decode', { callId, peerUpeerId: streamId, kind: frame.kind, error: cause instanceof Error ? cause.message : String(cause) });
        });
    }, [callId]);

    useEffect(() => {
        sessionRef.current = new WebCodecsSession();
        const unsubscribe = window.upeer?.onCallMedia?.(handleRemoteMedia);
        return () => {
            unsubscribe?.();
            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            screenRef.current?.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
            screenRef.current = null;
            captureGenerationRef.current += 1;
            const session = sessionRef.current;
            sessionRef.current = null;
            if (session) void session.release();
        };
    }, [callId, handleRemoteMedia]);

    const startLocalCapture = useCallback(async (video: boolean): Promise<boolean> => {
        if (localStreamRef.current) return true;
        const generation = captureGenerationRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: video ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } : false,
            });
            if (generation !== captureGenerationRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            const session = sessionRef.current ?? new WebCodecsSession();
            localStreamRef.current = stream;
            sessionRef.current = session;
            setLocalStream(stream);
            await session.startCapture(stream, 'audio', (chunk) => {
                if (generation === captureGenerationRef.current) sendChunk(chunk);
            });
            if (video) {
                await session.startCapture(stream, 'video', (chunk) => {
                    if (generation === captureGenerationRef.current) sendChunk(chunk);
                });
            }
            if (generation !== captureGenerationRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            return true;
        } catch (cause) {
            console.error(`Call ${callId} local media capture failed`, cause);
            if (generation === captureGenerationRef.current) {
                if (!localStreamRef.current) setLocalStream(null);
            }
            return false;
        }
    }, [callId, sendChunk]);

    const stopScreenShare = useCallback(() => {
        screenRef.current?.getTracks().forEach((track) => track.stop());
        screenRef.current = null;
        setScreenSharing(false);
    }, []);

    const startScreenShare = useCallback(async (options: ScreenCaptureOptions): Promise<boolean> => {
        try {
            const stream = await (navigator.mediaDevices as unknown as {
                getDisplayMedia: (opts: Record<string, unknown>) => Promise<MediaStream>;
            }).getDisplayMedia({
                video: { displaySurface: options.target === 'window' ? 'window' : 'monitor', frameRate: 15 },
                audio: options.withSystemAudio,
            });
            const session = sessionRef.current;
            if (!session) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            screenRef.current = stream;
            setScreenSharing(true);
            await session.startCapture(stream, 'screen', sendChunk);
            stream.getVideoTracks()[0]?.addEventListener('ended', stopScreenShare);
            return true;
        } catch (cause) {
            console.error(`Call ${callId} screen capture failed`, cause);
            return false;
        }
    }, [callId, sendChunk, stopScreenShare]);

    const stopLocalCapture = useCallback(() => {
        captureGenerationRef.current += 1;
        const session = sessionRef.current;
        const replacementSession = new WebCodecsSession();
        sessionRef.current = replacementSession;
        if (session) void session.release();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        screenRef.current?.getTracks().forEach((track) => track.stop());
        screenRef.current = null;
        setLocalStream(null);
        setScreenSharing(false);
    }, []);

    const setVideoEnabled = useCallback((enabled: boolean) => {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = enabled;
        });
        screenRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = enabled;
        });
    }, []);

    const setAudioEnabled = useCallback((enabled: boolean) => {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = enabled;
        });
    }, []);

    useEffect(() => {
        if (captureActive) {
            void startLocalCapture(call.kind === 'video');
            return;
        }
        stopLocalCapture();
        stopScreenShare();
    }, [captureActive, call?.kind, startLocalCapture, stopLocalCapture, stopScreenShare]);

    useEffect(() => {
        if (call?.phase === 'idle' || call?.phase === 'ended') stopLocalCapture();
    }, [call?.phase, stopLocalCapture]);

    return {
        startLocalCapture,
        stopLocalCapture,
        startScreenShare,
        stopScreenShare,
        screenSharing,
        localStream,
        setOnRemoteFrame,
        setVideoEnabled,
        setAudioEnabled,
        enabled: call?.phase === 'connected',
    };
}

function logRemoteMediaDiagnostic(key: string, message: string, details: Record<string, unknown>): void {
    if (remoteMediaDiagnostics.has(key)) return;
    remoteMediaDiagnostics.add(key);
    console.info(`[call] ${message}`, details);
}