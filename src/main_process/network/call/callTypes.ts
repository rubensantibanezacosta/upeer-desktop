export type CallMediaKind = 'audio' | 'video';
export type CallPhase = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'negotiating' | 'connected' | 'ended';
export type CallDirection = 'outgoing' | 'incoming';
export type CallEndReason = 'local-hangup' | 'remote-end' | 'rejected' | 'busy' | 'canceled' | 'no-answer' | 'error';

export interface CallSession {
    callId: string;
    peerUpeerId: string;
    phase: CallPhase;
    kind: CallMediaKind;
    direction: CallDirection;
    muted: boolean;
    cameraEnabled: boolean;
    startedAt: number;
    endedAt?: number;
    endReason?: CallEndReason;
    isRelay: boolean;
    relayFor: string[];
    relayUpeerId?: string;
    isGroup: boolean;
    groupMembers: string[];
}

export type CallStateChange = {
    callId: string;
    peerUpeerId: string;
    phase: CallPhase;
    kind: CallMediaKind;
    direction: CallDirection;
    endReason?: CallEndReason;
    isGroup?: boolean;
    groupMembers?: string[];
};

export type CallStateListener = (change: CallStateChange) => void;
