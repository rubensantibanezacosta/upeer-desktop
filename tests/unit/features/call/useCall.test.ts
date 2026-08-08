import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCall } from '../../../../src/features/call/useCall.js';
import { useCallStore } from '../../../../src/features/call/useCallStore.js';

function installBridge(overrides: Record<string, unknown> = {}) {
    (globalThis as unknown as { window: unknown }).window = {
        upeer: {
            startCall: vi.fn(async () => ({ success: true, callId: 'c1' })),
            acceptCall: vi.fn(async () => ({ success: true })),
            rejectCall: vi.fn(async () => ({ success: true })),
            endCall: vi.fn(async () => ({ success: true })),
            toggleMedia: vi.fn(async () => ({ success: true })),
            onCallIncoming: vi.fn(() => () => undefined),
            onCallAccepted: vi.fn(() => () => undefined),
            onCallEnded: vi.fn(() => () => undefined),
            onCallMediaUpdate: vi.fn(() => () => undefined),
            ...overrides,
        },
    };
    return (globalThis as unknown as { window: { upeer: Record<string, ReturnType<typeof vi.fn>> } }).window.upeer;
}

describe('useCall', () => {
    beforeEach(() => {
        useCallStore.getState().reset();
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

    it('reacciona a una llamada entrante emitida por el puente', async () => {
        const bridge = installBridge();
        let incomingCallback: ((data: { callId: string; peerUpeerId: string; kind: 'audio' | 'video' }) => void) | undefined;
        bridge.onCallIncoming = vi.fn((cb) => {
            incomingCallback = cb;
            return () => undefined;
        }) as ReturnType<typeof vi.fn>;

        const { result } = renderHook(() => useCall());
        await act(async () => {
            incomingCallback?.({ callId: 'in-1', peerUpeerId: 'peer9', kind: 'video' });
        });
        expect(result.current.call.phase).toBe('incoming-ringing');
        expect(result.current.call.peerUpeerId).toBe('peer9');
    });
});
