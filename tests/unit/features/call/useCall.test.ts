import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCall } from '../../../../src/features/call/useCall.js';
import { useCallStore } from '../../../../src/features/call/useCallStore.js';
import { useNavigationStore } from '../../../../src/store/useNavigationStore.js';

let incomingCallback: ((data: { callId: string; peerUpeerId: string; kind: 'audio' | 'video'; isGroup?: boolean; groupMembers?: string[] }) => void) | undefined;
let memberJoinedCallback: ((data: { callId: string; peerUpeerId: string }) => void) | undefined;
let memberLeftCallback: ((data: { callId: string; peerUpeerId: string }) => void) | undefined;
let mediaUpdateCallback: ((data: { callId: string; peerUpeerId: string; muted: boolean; cameraEnabled: boolean }) => void) | undefined;
let endedCallback: ((data: { callId: string; peerUpeerId: string; reason?: string }) => void) | undefined;
let acceptedCallback: ((data: { callId: string; peerUpeerId: string; connectedAt?: number }) => void) | undefined;

function installBridge(overrides: Record<string, unknown> = {}) {
    incomingCallback = undefined;
    memberJoinedCallback = undefined;
    memberLeftCallback = undefined;
    mediaUpdateCallback = undefined;
    endedCallback = undefined;
    acceptedCallback = undefined;
    (globalThis as unknown as { window: unknown }).window = {
        upeer: {
            startCall: vi.fn(async () => ({ success: true, callId: 'c1' })),
            startGroupCall: vi.fn(async () => ({ success: true, callId: 'gc1' })),
            acceptCall: vi.fn(async () => ({ success: true })),
            rejectCall: vi.fn(async () => ({ success: true })),
            endCall: vi.fn(async () => ({ success: true })),
            toggleMedia: vi.fn(async () => ({ success: true })),
            getAllCalls: vi.fn(async () => ({ success: true, calls: [] })),
            onCallIncoming: vi.fn((cb: typeof incomingCallback) => {
                incomingCallback = cb;
                return () => undefined;
            }),
            onCallAccepted: vi.fn((cb: typeof acceptedCallback) => {
                acceptedCallback = cb;
                return () => undefined;
            }),
            onCallEnded: vi.fn((cb: typeof endedCallback) => {
                endedCallback = cb;
                return () => undefined;
            }),
            onCallMediaUpdate: vi.fn((cb: typeof mediaUpdateCallback) => {
                mediaUpdateCallback = cb;
                return () => undefined;
            }),
            onCallMemberJoined: vi.fn((cb: typeof memberJoinedCallback) => {
                memberJoinedCallback = cb;
                return () => undefined;
            }),
            onCallMemberLeft: vi.fn((cb: typeof memberLeftCallback) => {
                memberLeftCallback = cb;
                return () => undefined;
            }),
            onCallRing: vi.fn(() => () => undefined),
            ...overrides,
        },
    };
    return (globalThis as unknown as { window: { upeer: Record<string, ReturnType<typeof vi.fn>> } }).window.upeer;
}

function fireIncoming(data: { callId: string; peerUpeerId: string; kind: 'audio' | 'video'; isGroup?: boolean; groupMembers?: string[] }) {
    act(() => {
        incomingCallback?.(data);
    });
}

describe('useCall', () => {
    beforeEach(() => {
        useCallStore.getState().reset();
        useNavigationStore.getState().goToChat();
        installBridge();
    });
    afterEach(() => {
        cleanup();
    });

    it('empieza inactivo', () => {
        const { result } = renderHook(() => useCall());
        expect(result.current.call.phase).toBe('idle');
        expect(result.current.isActive).toBe(false);
    });

    it('startCall marca la llamada como saliente y activa', async () => {
        const { result } = renderHook(() => useCall());
        await act(async () => {
            await result.current.startCall('peer1', 'audio');
        });
        expect(result.current.call.phase).toBe('outgoing-ringing');
        expect(result.current.call.peerUpeerId).toBe('peer1');
        expect(result.current.isActive).toBe(true);
    });

    it('rechaza iniciar una segunda llamada mientras ya hay otra activa', async () => {
        const bridge = installBridge();
        const { result } = renderHook(() => useCall());
        await act(async () => {
            await result.current.startCall('peer1', 'audio');
        });

        let secondResult: unknown;
        await act(async () => {
            secondResult = await result.current.startCall('peer2', 'video');
        });

        expect(secondResult).toMatchObject({ success: false });
        expect(bridge.startCall).toHaveBeenCalledTimes(1);
    });

    it('rechaza llamadas al propio usuario sin invocar el puente', async () => {
        const bridge = installBridge();
        const { result } = renderHook(() => useCall('self-id'));
        let startResult: unknown;

        await act(async () => {
            startResult = await result.current.startCall('self-id', 'audio');
        });

        expect(startResult).toMatchObject({ success: false });
        expect(bridge.startCall).not.toHaveBeenCalled();
    });

    it('endCall resetea a idle', async () => {
        const { result } = renderHook(() => useCall());
        await act(async () => {
            await result.current.startCall('peer1', 'video');
        });
        await act(async () => {
            await result.current.endCall();
        });
        expect(result.current.call.phase).toBe('idle');
        expect(result.current.isActive).toBe(false);
    });

    it('quita la ventana local antes de esperar la respuesta IPC al colgar', async () => {
        let resolveEndCall: (() => void) | undefined;
        const bridge = installBridge({
            endCall: vi.fn(() => new Promise((resolve) => {
                resolveEndCall = () => resolve({ success: true });
            })),
        });
        const { result } = renderHook(() => useCall());
        await act(async () => {
            await result.current.startCall('peer1', 'video');
        });
        act(() => {
            void result.current.endCall('c1');
        });
        expect(result.current.isActive).toBe(false);
        expect(bridge.endCall).toHaveBeenCalledWith('c1');
        await act(async () => resolveEndCall?.());
    });

    it('reacciona a una llamada entrante emitida por el puente', async () => {
        const { result } = renderHook(() => useCall());
        fireIncoming({ callId: 'in-1', peerUpeerId: 'peer9', kind: 'video' });
        expect(result.current.call.phase).toBe('incoming-ringing');
        expect(result.current.call.peerUpeerId).toBe('peer9');
    });

    it('lleva a llamadas inmediatamente al iniciar una llamada', async () => {
        let resolveStart: ((value: { success: boolean; callId: string }) => void) | undefined;
        installBridge({
            startCall: vi.fn(() => new Promise((resolve) => {
                resolveStart = resolve;
            })),
        });
        const { result } = renderHook(() => useCall());
        await act(async () => {
            void result.current.startCall('peer1', 'audio');
            await Promise.resolve();
        });
        expect(useNavigationStore.getState().appView).toBe('calls');
        await act(async () => resolveStart?.({ success: true, callId: 'c1' }));
    });

    it('mantiene la sección de llamadas y termina el inicio cuando IPC falla', async () => {
        installBridge({ startCall: vi.fn(async () => ({ success: false, error: 'Contact unavailable' })) });
        const { result } = renderHook(() => useCall());
        await act(async () => {
            await result.current.startCall('peer1', 'video');
        });

        expect(useNavigationStore.getState().appView).toBe('calls');
        expect(useCallStore.getState().isStartingCall).toBe(false);
    });

    it('lleva a llamadas a quien acepta una llamada entrante', async () => {
        const { result } = renderHook(() => useCall());
        fireIncoming({ callId: 'in-1', peerUpeerId: 'peer9', kind: 'video' });

        await act(async () => {
            await result.current.acceptCall('in-1');
        });

        expect(useNavigationStore.getState().appView).toBe('calls');
        expect(window.upeer.acceptCall).toHaveBeenCalledWith('in-1');
    });

    it('actualiza la membresía del grupo en tiempo real', async () => {
        const { result } = renderHook(() => useCall());
        fireIncoming({ callId: 'g1', peerUpeerId: 'peer9', kind: 'video', isGroup: true, groupMembers: ['peerA'] });
        act(() => {
            memberJoinedCallback?.({ callId: 'g1', peerUpeerId: 'peerB' });
        });
        expect(result.current.activeCalls[0]?.groupMembers).toContain('peerB');
        act(() => {
            memberLeftCallback?.({ callId: 'g1', peerUpeerId: 'peerB' });
        });
        expect(result.current.activeCalls[0]?.groupMembers).not.toContain('peerB');
    });

    it('refleja los cambios remotos de mute y cámara en la UI', () => {
        const { result } = renderHook(() => useCall());
        fireIncoming({ callId: 'media-1', peerUpeerId: 'peer9', kind: 'video' });
        act(() => mediaUpdateCallback?.({ callId: 'media-1', peerUpeerId: 'peer9', muted: true, cameraEnabled: false }));
        expect(result.current.activeCalls[0]).toMatchObject({ muted: true, cameraEnabled: false });
    });
});
