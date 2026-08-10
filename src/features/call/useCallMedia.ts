import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallStore } from './useCallStore.js';

type SdpMessage = { type: string; sdp?: string; relay?: string };
type ScreenCaptureOptions = { target: 'screen' | 'window'; withSystemAudio: boolean };

export function useCallMedia() {
    const call = useCallStore((s) => (s.activeCallId ? s.calls[s.activeCallId] : undefined)) ?? { phase: 'idle' as const, kind: 'audio' as const, muted: false, cameraEnabled: false };
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const screenRef = useRef<MediaStream | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [screenSharing, setScreenSharing] = useState(false);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

    const sendSdp = useCallback((description: RTCSessionDescriptionInit | null) => {
        const callId = useCallStore.getState().activeCallId;
        if (!callId || !description) {
            return;
        }
        void window.upeer.sendCallSdp(callId, { type: description.type, sdp: description.sdp });
    }, []);

    const sendIce = useCallback((candidate: RTCIceCandidate | null) => {
        const callId = useCallStore.getState().activeCallId;
        if (!callId || !candidate) {
            return;
        }
        void window.upeer.sendCallIce(callId, candidate.toJSON() as unknown as Record<string, unknown>);
    }, []);

    const handleRemoteSdp = useCallback((_callId: string, sdp: SdpMessage) => {
        const peer = peerRef.current;
        if (!peer) {
            return;
        }
        void (async () => {
            try {
                await peer.setRemoteDescription({ type: sdp.type as RTCSdpType, sdp: sdp.sdp });
                if (sdp.type === 'offer') {
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    sendSdp(answer);
                }
                while (pendingCandidatesRef.current.length) {
                    const c = pendingCandidatesRef.current.shift();
                    if (c) {
                        await peer.addIceCandidate(c).catch(() => undefined);
                    }
                }
            } catch {
                // Se ignora: error transitorio de negociación.
            }
        })();
    }, [sendSdp]);

    const handleRemoteIce = useCallback((_callId: string, candidate: Record<string, unknown>) => {
        const peer = peerRef.current;
        if (!peer) {
            return;
        }
        const init = candidate as unknown as RTCIceCandidateInit;
        if (!peer.remoteDescription) {
            pendingCandidatesRef.current.push(init);
        } else {
            void peer.addIceCandidate(init).catch(() => undefined);
        }
    }, []);

    useEffect(() => {
        const unsubs = [
            window.upeer?.onCallSdp?.((data) => handleRemoteSdp(data.callId, data.sdp)),
            window.upeer?.onCallIce?.((data) => handleRemoteIce(data.callId, data.candidate)),
        ].filter(Boolean) as Array<() => void>;
        return () => {
            unsubs.forEach((u) => u());
        };
    }, [handleRemoteSdp, handleRemoteIce]);


    const startLocalCapture = useCallback(async (video: boolean): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            // Sin STUN/TURN: en la mesh Yggdrasil cada nodo es alcanzable por su IP 200::.
            const peer = new RTCPeerConnection({ iceServers: [] });
            peerRef.current = peer;
            remoteStreamRef.current = new MediaStream();
            setRemoteStream(remoteStreamRef.current);

            stream.getTracks().forEach((track) => peer.addTrack(track, stream));
            peer.ontrack = (event) => {
                event.streams[0]?.getTracks().forEach((t) => remoteStreamRef.current?.addTrack(t));
            };
            peer.onnegotiationneeded = async () => {
                try {
                    const offer = await peer.createOffer();
                    await peer.setLocalDescription(offer);
                    sendSdp(offer);
                } catch {
                    // Se ignora: error transitorio.
                }
            };
            peer.onicecandidate = (event) => sendIce(event.candidate);
            return true;
        } catch {
            return false;
        }
    }, [sendSdp, sendIce]);

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
                video: { displaySurface: options.target === 'window' ? 'window' : 'monitor', frameRate: 30 },
                audio: options.withSystemAudio,
            });
            screenRef.current = stream;
            setScreenSharing(true);
            const peer = peerRef.current;
            const videoSender = peer?.getSenders().find((s) => s.track?.kind === 'video');
            const videoTrack = stream.getVideoTracks()[0];
            if (videoSender && videoTrack) {
                await videoSender.replaceTrack(videoTrack);
            }
            stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                stopScreenShare();
            });
            return true;
        } catch {
            return false;
        }
    }, [stopScreenShare]);

    const stopLocalCapture = useCallback(() => {
        const peer = peerRef.current;
        if (peer) {
            peer.close();
            peerRef.current = null;
        }
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
        remoteStreamRef.current = null;
        setRemoteStream(null);
        stopScreenShare();
    }, [stopScreenShare]);

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
        if (call.phase === 'idle' || call.phase === 'ended') {
            stopLocalCapture();
        }
    }, [call.phase, stopLocalCapture]);

    return {
        startLocalCapture,
        stopLocalCapture,
        startScreenShare,
        stopScreenShare,
        screenSharing,
        localStream,
        remoteStream,
        setVideoEnabled,
        setAudioEnabled,
        enabled: call.phase === 'connected',
    };
}

