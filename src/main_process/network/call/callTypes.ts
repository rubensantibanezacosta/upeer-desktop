export type CallMediaKind = 'audio' | 'video';
export type CallPhase = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'negotiating' | 'connected' | 'ended';
export type CallDirection = 'outgoing' | 'incoming';
/**
 * `answered-elsewhere` es el caso de una cuenta con varios dispositivos: la llamada sonó en todos y
 * la contestó otro. No es una llamada perdida y no se escribe en el historial — escribirlo dejaría una
 * «Llamada perdida» falsa en el portátil cada vez que contestas desde el móvil.
 */
export type CallEndReason = 'local-hangup' | 'remote-end' | 'rejected' | 'busy' | 'canceled' | 'no-answer' | 'answered-elsewhere' | 'error';

export interface CallSession {
    callId: string;
    peerUpeerId: string;
    phase: CallPhase;
    kind: CallMediaKind;
    direction: CallDirection;
    muted: boolean;
    cameraEnabled: boolean;
    startedAt: number;
    connectedAt?: number;
    endedAt?: number;
    eventWritten?: boolean;
    endReason?: CallEndReason;
    isRelay: boolean;
    relayFor: string[];
    relayUpeerId?: string;
    isGroup: boolean;
    groupId?: string;
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
    groupId?: string;
    groupMembers?: string[];
    startedAt?: number;
    connectedAt?: number;
    endedAt?: number;
    eventWritten?: boolean;
};

export type CallStateListener = (change: CallStateChange) => void;
