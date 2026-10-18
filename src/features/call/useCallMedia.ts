import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeMediaFrame, encodeMediaFrame, type CallMediaKind } from './mediaChunker.js';
import { useCallStore } from './useCallStore.js';
import { WebCodecsSession, type MediaChunk } from './webCodecsSession.js';
import { adaptCallQuality, CallQualityMonitor, type CallQualityLevel, type QualityFeedback } from './callQuality.js';

type ScreenCaptureOptions = { target: 'screen' | 'window'; withSystemAudio: boolean };
export type RemoteFrameHandler = (kind: CallMediaKind, frame: unknown, peerUpeerId: string) => void;
export type ScreenShareErrorHandler = (message: string) => void;

const remoteMediaDiagnostics = new Set<string>();

export function useCallMedia(callId: string) {
    const call = useCallStore((state) => state.calls[callId]);
    const captureActive = call?.phase === 'negotiating' || call?.phase === 'connected';
    const sessionRef = useRef<WebCodecsSession | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const captureGenerationRef = useRef(0);
    const screenRef = useRef<MediaStream | null>(null);
    const sequenceRef = useRef<Record<CallMediaKind, number>>({ audio: 0, video: 0, screen: 0 });
    const qualityMonitorRef = useRef(new CallQualityMonitor());
    const qualityRef = useRef<CallQualityLevel>({ bitrate: 700_000, framerate: 24 });
    const qualityProbeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onRemoteFrameRef = useRef<RemoteFrameHandler | null>(null);
    const onScreenShareErrorRef = useRef<ScreenShareErrorHandler | null>(null);
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
        const feedback = qualityMonitorRef.current.observe(streamId, frame.kind, frame.seq, frame.data.byteLength, frame.ts);
        if (feedback) window.upeer.sendCallMeta(callId, { ...feedback, target: streamId, rttMs: qualityMonitorRef.current.getRtt(streamId) ?? 0 });
        const diagnosticKey = `${callId}:${streamId}:${frame.kind}`;
        logRemoteMediaDiagnostic(`${diagnosticKey}:frame-received`, 'Remote CALL_MEDIA frame passed renderer parsing and was queued for decode', { callId, peerUpeerId: streamId, kind: frame.kind, mediaBytes: frame.data.byteLength, keyFrame: frame.keyFrame });
        void session.decodeChunk(frame.kind, frame.data, frame.ts, frame.keyFrame ?? true, (decoded) => {
            logRemoteMediaDiagnostic(`${diagnosticKey}:frame-decoded`, 'Remote CALL_MEDIA frame decoded by WebCodecs', { callId, peerUpeerId: streamId, kind: frame.kind });
            onRemoteFrameRef.current?.(frame.kind, decoded, streamId);
        }, streamId).catch((cause: unknown) => {
            logRemoteMediaDiagnostic(`${diagnosticKey}:decode-failed`, 'Remote CALL_MEDIA frame could not be queued for WebCodecs decode', { callId, peerUpeerId: streamId, kind: frame.kind, error: cause instanceof Error ? cause.message : String(cause) });
        });
    }, [callId]);

    const handleCallMeta = useCallback((event: { callId: string; peerUpeerId: string; meta?: unknown }) => {
        if (event.callId !== callId || !event.meta || typeof event.meta !== 'object') return;
        const report = event.meta as { type?: string; target?: string; source?: string; origin?: string; mediaKind?: CallMediaKind; lossRatio?: number; jitterMs?: number; sendBitrate?: number; rttMs?: number; sentAt?: number };
        if (report.type === 'quality-probe' && typeof report.origin === 'string' && typeof report.sentAt === 'number') {
            window.upeer.sendCallMeta(callId, { type: 'quality-probe-ack', target: report.origin, sentAt: report.sentAt });
            return;
        }
        if (report.type === 'quality-probe-ack' && typeof report.target === 'string' && typeof report.sentAt === 'number') {
            const rttMs = qualityMonitorRef.current.resolveProbe(event.peerUpeerId, report.sentAt);
            if (rttMs !== null) {
                const next = adaptCallQuality(qualityRef.current, { type: 'quality-feedback', target: report.target, mediaKind: 'video', lossRatio: 0, jitterMs: 0, sendBitrate: qualityRef.current.bitrate, rttMs });
                if (next.bitrate !== qualityRef.current.bitrate || next.framerate !== qualityRef.current.framerate) {
                    qualityRef.current = next;
                    sessionRef.current?.setVideoQuality(next);
                }
            }
            return;
        }
        if (report.type !== 'quality-feedback' || typeof report.target !== 'string' || (report.mediaKind !== 'audio' && report.mediaKind !== 'video' && report.mediaKind !== 'screen') || typeof report.lossRatio !== 'number' || typeof report.jitterMs !== 'number' || typeof report.sendBitrate !== 'number') return;
        const next = adaptCallQuality(qualityRef.current, report as QualityFeedback);
        if (next.bitrate !== qualityRef.current.bitrate || next.framerate !== qualityRef.current.framerate) {
            qualityRef.current = next;
            sessionRef.current?.setVideoQuality(next);
        }
    }, [callId]);

    useEffect(() => {
        sessionRef.current = new WebCodecsSession();
        const unsubscribe = window.upeer?.onCallMedia?.(handleRemoteMedia);
        const unsubscribeMeta = window.upeer?.onCallMeta?.(handleCallMeta);
        const qualityMonitor = qualityMonitorRef.current;
        qualityProbeTimerRef.current = setInterval(() => {
            const currentCall = useCallStore.getState().calls[callId];
            if (currentCall?.phase !== 'connected') return;
            const target = currentCall.isGroup ? currentCall.relayUpeerId : currentCall.peerUpeerId;
            if (target) window.upeer.sendCallMeta(callId, qualityMonitor.createProbe(target));
        }, 5000);
        return () => {
            unsubscribe?.();
            unsubscribeMeta?.();
            if (qualityProbeTimerRef.current) clearInterval(qualityProbeTimerRef.current);
            qualityProbeTimerRef.current = null;
            qualityMonitor.reset();
            screenRef.current?.getTracks().forEach((track) => track.stop());
            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
            screenRef.current = null;
            captureGenerationRef.current += 1;
            const session = sessionRef.current;
            sessionRef.current = null;
            if (session) void session.release();
        };
    }, [callId, handleCallMeta, handleRemoteMedia]);

    const startLocalCapture = useCallback(async (video: boolean): Promise<boolean> => {
        if (localStreamRef.current) return true;
        const generation = captureGenerationRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 48000 },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: video ? { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 30 } } : false,
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
            }, 'audio', (active) => {
                if (generation === captureGenerationRef.current) window.upeer.sendCallSpeakerState(callId, active);
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
        const stream = screenRef.current;
        if (!stream) return;
        screenRef.current = null;
        window.upeer.sendCallMeta(callId, { type: 'screen-share', active: false });
        stream?.getTracks().forEach((track) => track.stop());
        const session = sessionRef.current;
        void session?.stopCapture('screen').catch((cause: unknown) => {
            console.warn(`Call ${callId} screen capture reader stopped with an error:`, cause);
        });
        void session?.stopCapture('screen-audio').catch((cause: unknown) => {
            console.warn(`Call ${callId} screen audio reader stopped with an error:`, cause);
        });
        setScreenSharing(false);
    }, [callId]);

    const startScreenShare = useCallback(async (options: ScreenCaptureOptions): Promise<boolean> => {
        let stream: MediaStream | null = null;
        try {
            stream = await (navigator.mediaDevices as unknown as {
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
            await session.startCapture(stream, 'screen', sendChunk);
            if (options.withSystemAudio) await session.startCapture(stream, 'audio', sendChunk, 'screen-audio');
            if (options.withSystemAudio && stream.getAudioTracks().length === 0) {
                throw new Error('El sistema no proporcionó una pista de audio para la pantalla compartida.');
            }
            screenRef.current = stream;
            setScreenSharing(true);
            window.upeer.sendCallMeta(callId, { type: 'screen-share', active: true });
            stream.getVideoTracks()[0]?.addEventListener('ended', stopScreenShare);
            return true;
        } catch (cause) {
            const failedStream = screenRef.current ?? stream;
            screenRef.current = null;
            failedStream?.getTracks().forEach((track) => track.stop());
            await sessionRef.current?.stopCapture('screen').catch((stopCause: unknown) => {
                console.warn(`Call ${callId} screen capture cleanup failed:`, stopCause);
            });
            await sessionRef.current?.stopCapture('screen-audio').catch((stopCause: unknown) => {
                console.warn(`Call ${callId} screen audio cleanup failed:`, stopCause);
            });
            setScreenSharing(false);
            const message = cause instanceof Error ? cause.message : 'No se pudo iniciar la captura de pantalla.';
            console.error(`Call ${callId} screen capture failed`, cause);
            onScreenShareErrorRef.current?.(message);
            return false;
        }
    }, [callId, sendChunk, stopScreenShare]);

    const setOnScreenShareError = useCallback((handler: ScreenShareErrorHandler | null) => {
        onScreenShareErrorRef.current = handler;
    }, []);

    const stopLocalCapture = useCallback(() => {
        captureGenerationRef.current += 1;
        const session = sessionRef.current;
        sessionRef.current = null;
        if (session) void session.release();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        window.upeer.sendCallSpeakerState(callId, false);
        if (screenRef.current) window.upeer.sendCallMeta(callId, { type: 'screen-share', active: false });
        screenRef.current?.getTracks().forEach((track) => track.stop());
        screenRef.current = null;
        setLocalStream(null);
        setScreenSharing(false);
    }, [callId]);

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
        setOnScreenShareError,
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
