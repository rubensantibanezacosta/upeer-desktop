import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallStore } from './useCallStore.js';

type SdpMessage = { type: string; sdp?: string; relay?: string };
type ScreenCaptureOptions = { target: 'screen' | 'window'; withSystemAudio: boolean };

export function useCallMedia() {
    const call = useCallStore((s) => (s.activeCallId ? s.calls[s.activeCallId] : undefined)) ?? { phase: 'idle' as const, kind: 'audio' as const, muted: false, cameraEnabled: false, peerUpeerId: undefined, groupMembers: undefined };
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenRef = useRef<MediaStream | null>(null);
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const myUpeerIdRef = useRef<string | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
    const [screenSharing, setScreenSharing] = useState(false);

    const sendSdp = useCallback((peerUpeerId: string, description: RTCSessionDescriptionInit | null) => {
        const callId = useCallStore.getState().activeCallId;
        if (!callId || !description || !peerUpeerId) {
            return;
        }
        void window.upeer.sendCallSdp(callId, peerUpeerId, { type: description.type, sdp: description.sdp });
    }, []);

    const sendIce = useCallback((peerUpeerId: string, candidate: RTCIceCandidate | null) => {
        const callId = useCallStore.getState().activeCallId;
        if (!callId || !candidate || !peerUpeerId) {
            return;
        }
        void window.upeer.sendCallIce(callId, peerUpeerId, candidate.toJSON() as unknown as Record<string, unknown>);
    }, []);

    const attachRemoteStream = useCallback((peerUpeerId: string, incoming: MediaStream) => {
        const existing = remoteStreamsRef.current.get(peerUpeerId) ?? new MediaStream();
        incoming.getTracks().forEach((t) => existing.addTrack(t));
        remoteStreamsRef.current.set(peerUpeerId, existing);
        const combined = new MediaStream();
        for (const s of remoteStreamsRef.current.values()) {
            s.getTracks().forEach((t) => combined.addTrack(t));
        }
        setRemoteStream(combined);
        setRemoteStreams(Object.fromEntries(remoteStreamsRef.current.entries()));
    }, []);

    const ensurePeer = useCallback((peerUpeerId: string, stream: MediaStream): RTCPeerConnection => {
        const existing = peersRef.current.get(peerUpeerId);
        if (existing) {
            return existing;
        }
        const peer = new RTCPeerConnection({ iceServers: [] });
        peersRef.current.set(peerUpeerId, peer);
        remoteStreamsRef.current.set(peerUpeerId, new MediaStream());
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        peer.ontrack = (event) => {
            if (event.streams[0]) {
                attachRemoteStream(peerUpeerId, event.streams[0]);
                // SFU: si soy el relay, reenviar los tracks recibidos al resto de conexiones.
                if (myUpeerIdRef.current && call.relayUpeerId === myUpeerIdRef.current) {
                    const incoming = event.streams[0];
                    for (const [pid, otherPeer] of peersRef.current) {
                        if (pid !== peerUpeerId) {
                            incoming.getTracks().forEach((t) => {
                                try {
                                    otherPeer.addTrack(t, incoming);
                                } catch {
                                    // Track ya añadido.
                                }
                            });
                        }
                    }
                }
            }
        };
        peer.onnegotiationneeded = async () => {
            try {
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                sendSdp(peerUpeerId, offer);
            } catch {
                // Se ignora: error transitorio.
            }
        };
        peer.onicecandidate = (event) => sendIce(peerUpeerId, event.candidate);
        return peer;
    }, [attachRemoteStream, sendSdp, sendIce]);

    const handleRemoteSdp = useCallback((peerUpeerId: string, sdp: SdpMessage) => {
        const local = localStreamRef.current;
        if (!local || !peerUpeerId) {
            return;
        }
        const peer = ensurePeer(peerUpeerId, local);
        void (async () => {
            try {
                await peer.setRemoteDescription({ type: sdp.type as RTCSdpType, sdp: sdp.sdp });
                if (sdp.type === 'offer') {
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    sendSdp(peerUpeerId, answer);
                }
                const pending = pendingCandidatesRef.current.get(peerUpeerId) ?? [];
                pendingCandidatesRef.current.delete(peerUpeerId);
                for (const c of pending) {
                    await peer.addIceCandidate(c).catch(() => undefined);
                }
            } catch {
                // Se ignora: error transitorio de negociación.
            }
        })();
    }, [ensurePeer, sendSdp]);

    const handleRemoteIce = useCallback((peerUpeerId: string, candidate: Record<string, unknown>) => {
        const peer = peersRef.current.get(peerUpeerId);
        const init = candidate as unknown as RTCIceCandidateInit;
        if (!peer || !peer.remoteDescription) {
            const list = pendingCandidatesRef.current.get(peerUpeerId) ?? [];
            list.push(init);
            pendingCandidatesRef.current.set(peerUpeerId, list);
        } else {
            void peer.addIceCandidate(init).catch(() => undefined);
        }
    }, []);

    useEffect(() => {
        const unsubs = [
            window.upeer?.onCallSdp?.((data) => handleRemoteSdp(data.peerUpeerId, data.sdp)),
            window.upeer?.onCallIce?.((data) => handleRemoteIce(data.peerUpeerId, data.candidate)),
        ].filter(Boolean) as Array<() => void>;
        return () => {
            unsubs.forEach((u) => u());
        };
    }, [handleRemoteSdp, handleRemoteIce]);



    useEffect(() => {
        window.upeer?.getMyIdentity?.().then((id) => {
            if (id?.upeerId) {
                myUpeerIdRef.current = id.upeerId;
            }
        }).catch(() => undefined);
    }, []);

    const startLocalCapture = useCallback(async (video: boolean): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            const allMembers = (call.isGroup && call.groupMembers?.length)
                ? call.groupMembers
                : (call.peerUpeerId ? [call.peerUpeerId] : []);
            const relay = call.relayUpeerId;
            const myId = myUpeerIdRef.current;
            let targets: string[] = allMembers;
            if (relay && myId) {
                // SFU: con relay electo, los no-relay conectan solo al relay; el relay a todos.
                targets = relay === myId ? allMembers : [relay];
            }
            for (const pid of targets) {
                if (pid) {
                    ensurePeer(pid, stream);
                }
            }
            return true;
        } catch {
            return false;
        }
    }, [call.isGroup, call.groupMembers, call.peerUpeerId, call.relayUpeerId, ensurePeer]);

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
            const videoTrack = stream.getVideoTracks()[0];
            for (const peer of peersRef.current.values()) {
                const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
                if (sender && videoTrack) {
                    await sender.replaceTrack(videoTrack);
                }
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
        for (const peer of peersRef.current.values()) {
            peer.close();
        }
        peersRef.current.clear();
        for (const s of remoteStreamsRef.current.values()) {
            s.getTracks().forEach((t) => t.stop());
        }
        remoteStreamsRef.current.clear();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setRemoteStreams({});
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
        remoteStreams,
        setVideoEnabled,
        setAudioEnabled,
        enabled: call.phase === 'connected',
    };
}

