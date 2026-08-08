import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callManager, createCallId } from '../../../src/main_process/network/call/callManager.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));

describe('callManager', () => {
    beforeEach(() => {
        callManager.resetForTests();
    });
    afterEach(() => {
        callManager.resetForTests();
        vi.useRealTimers();
    });

    it('crea llamada saliente en outgoing-ringing', () => {
        const session = callManager.create('peer1', 'audio', 'outgoing');
        expect(session.phase).toBe('outgoing-ringing');
        expect(session.direction).toBe('outgoing');
        expect(callManager.hasActiveWith('peer1')).toBe(true);
    });

    it('crea llamada entrante, acepta a negotiating y conecta', () => {
        const session = callManager.create('peer1', 'video', 'incoming');
        expect(session.phase).toBe('incoming-ringing');
        callManager.accept(session.callId);
        expect(session.phase).toBe('negotiating');
        callManager.connect(session.callId);
        expect(session.phase).toBe('connected');
    });

    it('rechaza y pasa a ended con la razón indicada', () => {
        const session = callManager.create('peer1', 'audio', 'incoming');
        callManager.reject(session.callId, 'busy');
        expect(session.phase).toBe('ended');
        expect(session.endReason).toBe('busy');
        expect(callManager.hasActiveWith('peer1')).toBe(false);
        expect(callManager.getActive()).toBeNull();
    });

    it('alterna mute y cámara', () => {
        const session = callManager.create('peer1', 'video', 'outgoing');
        expect(callManager.toggleMute(session.callId)).toBe(true);
        expect(callManager.toggleMute(session.callId)).toBe(false);
        expect(callManager.toggleCamera(session.callId)).toBe(false);
    });

    it('notifica cambios de estado a los listeners', () => {
        const listener = vi.fn();
        const unsubscribe = callManager.onStateChange(listener);
        const session = callManager.create('peer1', 'audio', 'outgoing');
        expect(listener).toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ callId: session.callId, phase: 'outgoing-ringing' }));
        unsubscribe();
        const before = listener.mock.calls.length;
        callManager.create('peer2', 'audio', 'outgoing');
        expect(listener.mock.calls.length).toBe(before);
    });

    it('timeout de ring termina como no-answer', () => {
        vi.useFakeTimers();
        const session = callManager.create('peer1', 'audio', 'outgoing');
        vi.advanceTimersByTime(31_000);
        expect(session.phase).toBe('ended');
        expect(session.endReason).toBe('no-answer');
    });

    it('no termina por timeout si ya está connected', () => {
        vi.useFakeTimers();
        const session = callManager.create('peer1', 'audio', 'incoming');
        callManager.accept(session.callId);
        callManager.connect(session.callId);
        vi.advanceTimersByTime(40_000);
        expect(session.phase).toBe('connected');
    });

    it('createCallId genera 32 caracteres hex', () => {
        expect(createCallId()).toMatch(/^[0-9a-f]{32}$/);
    });

    it('setRelay marca la sesión como relay con lista acotada', () => {
        const session = callManager.create('peer1', 'video', 'incoming');
        callManager.setRelay(session.callId, Array.from({ length: 40 }, (_, i) => `m${i}`));
        expect(session.isRelay).toBe(true);
        expect(session.relayFor.length).toBeLessThanOrEqual(32);
    });

    it('createGroup crea una sesión de grupo saliente con los miembros', () => {
        const session = callManager.createGroup(['peer1', 'peer2'], 'audio');
        expect(session.isGroup).toBe(true);
        expect(session.phase).toBe('outgoing-ringing');
        expect(session.groupMembers).toEqual(['peer1', 'peer2']);
    });

    it('createGroupIncoming crea una sesión de grupo entrante con el callId del oferente', () => {
        const session = callManager.createGroupIncoming('peer1', 'video', 'shared-call', ['peer1', 'peer3']);
        expect(session.isGroup).toBe(true);
        expect(session.phase).toBe('incoming-ringing');
        expect(session.callId).toBe('shared-call');
        expect(session.groupMembers).toEqual(['peer1', 'peer3']);
        expect(callManager.hasActiveWith('peer1')).toBe(true);
    });

    it('notifica el estado de grupo en los cambios', () => {
        const listener = vi.fn();
        const unsubscribe = callManager.onStateChange(listener);
        callManager.createGroup(['peer1'], 'audio');
        const change = listener.mock.calls[0][0] as { isGroup?: boolean; groupMembers?: string[] };
        expect(change.isGroup).toBe(true);
        expect(change.groupMembers).toEqual(['peer1']);
        unsubscribe();
    });
});
