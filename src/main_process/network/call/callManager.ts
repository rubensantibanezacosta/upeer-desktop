import { warn } from '../../security/secure-logger.js';
import type {
    CallDirection,
    CallEndReason,
    CallMediaKind,
    CallPhase,
    CallSession,
    CallStateChange,
    CallStateListener,
} from './callTypes.js';

const RING_TIMEOUT_MS = 30_000;
const NEGOTIATE_TIMEOUT_MS = 20_000;
const MAX_RELAY_MEMBERS = 32;

export function createCallId(): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

class CallManager {
    private sessions = new Map<string, CallSession>();
    private listeners = new Set<CallStateListener>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

    getActive(): CallSession | null {
        for (const session of this.sessions.values()) {
            if (session.phase !== 'ended' && session.phase !== 'idle') {
                return session;
            }
        }
        return null;
    }

    get(callId: string): CallSession | undefined {
        return this.sessions.get(callId);
    }

    getAll(): CallSession[] {
        return Array.from(this.sessions.values()).filter(
            (session) => session.phase !== 'ended' && session.phase !== 'idle',
        );
    }

    hasActiveWith(peerUpeerId: string): boolean {
        for (const session of this.sessions.values()) {
            if (session.peerUpeerId === peerUpeerId && session.phase !== 'ended') {
                return true;
            }
        }
        return false;
    }

    create(peerUpeerId: string, kind: CallMediaKind, direction: CallDirection, existingCallId?: string): CallSession {
        const callId = existingCallId && existingCallId.length > 0 ? existingCallId : createCallId();
        const session: CallSession = {
            callId,
            peerUpeerId,
            kind,
            direction,
            phase: direction === 'outgoing' ? 'outgoing-ringing' : 'incoming-ringing',
            muted: false,
            cameraEnabled: kind === 'video',
            startedAt: Date.now(),
            isRelay: false,
            relayFor: [],
            isGroup: false,
            groupMembers: [],
        };
        this.sessions.set(callId, session);
        this.armTimeout(callId, RING_TIMEOUT_MS, 'no-answer');
        this.notify(callId);
        return session;
    }

    createGroup(memberUpeerIds: string[], kind: CallMediaKind): CallSession {
        const callId = createCallId();
        const session: CallSession = {
            callId,
            peerUpeerId: memberUpeerIds[0] ?? '',
            kind,
            direction: 'outgoing',
            phase: 'outgoing-ringing',
            muted: false,
            cameraEnabled: kind === 'video',
            startedAt: Date.now(),
            isRelay: false,
            relayFor: [],
            isGroup: true,
            groupMembers: memberUpeerIds.slice(),
        };
        this.sessions.set(callId, session);
        this.armTimeout(callId, RING_TIMEOUT_MS, 'no-answer');
        this.notify(callId);
        return session;
    }

    createGroupIncoming(
        initiatorUpeerId: string,
        kind: CallMediaKind,
        existingCallId: string,
        memberUpeerIds: string[],
    ): CallSession {
        const callId = existingCallId && existingCallId.length > 0 ? existingCallId : createCallId();
        const session: CallSession = {
            callId,
            peerUpeerId: initiatorUpeerId,
            kind,
            direction: 'incoming',
            phase: 'incoming-ringing',
            muted: false,
            cameraEnabled: kind === 'video',
            startedAt: Date.now(),
            isRelay: false,
            relayFor: [],
            isGroup: true,
            groupMembers: memberUpeerIds.slice(),
        };
        this.sessions.set(callId, session);
        this.armTimeout(callId, RING_TIMEOUT_MS, 'no-answer');
        this.notify(callId);
        return session;
    }

    accept(callId: string): void {
        const session = this.sessions.get(callId);
        if (!session || (session.phase !== 'incoming-ringing' && session.phase !== 'outgoing-ringing')) {
            return;
        }
        this.transition(callId, 'negotiating');
        this.armTimeout(callId, NEGOTIATE_TIMEOUT_MS, 'error');
    }

    connect(callId: string): void {
        const session = this.sessions.get(callId);
        if (!session) {
            return;
        }
        this.clearTimer(callId);
        if (session.phase !== 'connected') {
            this.transition(callId, 'connected');
        }
    }

    reject(callId: string, reason: CallEndReason = 'rejected'): void {
        this.end(callId, reason);
    }

    end(callId: string, reason: CallEndReason = 'local-hangup'): void {
        const session = this.sessions.get(callId);
        if (!session) {
            return;
        }
        this.clearTimer(callId);
        this.transition(callId, 'ended', reason);
    }

    toggleMute(callId: string): boolean {
        const session = this.sessions.get(callId);
        if (!session) {
            return false;
        }
        session.muted = !session.muted;
        this.notify(callId);
        return session.muted;
    }

    toggleCamera(callId: string): boolean {
        const session = this.sessions.get(callId);
        if (!session) {
            return false;
        }
        session.cameraEnabled = !session.cameraEnabled;
        this.notify(callId);
        return session.cameraEnabled;
    }

    setRelay(callId: string, relayFor: string[]): void {
        const session = this.sessions.get(callId);
        if (!session) {
            return;
        }
        session.isRelay = true;
        session.relayFor = relayFor.slice(0, MAX_RELAY_MEMBERS);
    }

    onStateChange(listener: CallStateListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    resetForTests(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.sessions.clear();
        this.listeners.clear();
    }

    private transition(callId: string, phase: CallPhase, endReason?: CallEndReason): void {
        const session = this.sessions.get(callId);
        if (!session) {
            return;
        }
        session.phase = phase;
        if (phase === 'ended') {
            session.endedAt = Date.now();
            session.endReason = endReason;
        }
        this.notify(callId);
    }

    private notify(callId: string): void {
        const session = this.sessions.get(callId);
        if (!session) {
            return;
        }
        const change: CallStateChange = {
            callId: session.callId,
            peerUpeerId: session.peerUpeerId,
            phase: session.phase,
            kind: session.kind,
            direction: session.direction,
            endReason: session.endReason,
            isGroup: session.isGroup,
            groupMembers: session.groupMembers,
        };
        this.listeners.forEach((listener) => listener(change));
    }

    private armTimeout(callId: string, ms: number, reason: CallEndReason): void {
        this.clearTimer(callId);
        const timer = setTimeout(() => {
            const session = this.sessions.get(callId);
            if (session && session.phase !== 'ended' && session.phase !== 'connected') {
                this.end(callId, reason);
                warn(`Call ${callId} timed out with reason ${reason}`, undefined, 'call');
            }
        }, ms);
        this.timers.set(callId, timer);
    }

    private clearTimer(callId: string): void {
        const timer = this.timers.get(callId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(callId);
        }
    }
}

export const callManager = new CallManager();
