import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCallMedia } from '../../../../src/features/call/useCallMedia.js';
import { useCallStore } from '../../../../src/features/call/useCallStore.js';

const { releaseMock, startCaptureMock } = vi.hoisted(() => ({
    releaseMock: vi.fn(async () => undefined),
    startCaptureMock: vi.fn(async () => undefined),
}));

vi.mock('../../../../src/features/call/webCodecsSession.js', () => ({
    WebCodecsSession: class {
        startCapture = startCaptureMock;
        release = releaseMock;
    },
}));

describe('useCallMedia', () => {
    afterEach(() => {
        cleanup();
        useCallStore.getState().reset();
        vi.restoreAllMocks();
    });

    it('detiene las pistas de cámara y micrófono al desmontarse la ventana de llamada', async () => {
        const audioTrack = { stop: vi.fn(), clone: vi.fn() };
        const videoTrack = { stop: vi.fn(), clone: vi.fn() };
        const stream = {
            getTracks: () => [audioTrack, videoTrack],
            getAudioTracks: () => [audioTrack],
            getVideoTracks: () => [videoTrack],
        } as unknown as MediaStream;
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn(async () => stream) },
        });
        (globalThis as unknown as { window: unknown }).window = {
            upeer: {
                onCallMedia: vi.fn(() => () => undefined),
                sendCallMedia: vi.fn(),
                sendCallSpeakerState: vi.fn(),
                sendCallMeta: vi.fn(),
            },
        };
        useCallStore.setState({
            calls: {
                call1: {
                    callId: 'call1',
                    phase: 'connected',
                    kind: 'video',
                    muted: false,
                    cameraEnabled: true,
                },
            },
            activeCallId: 'call1',
        });

        const { unmount } = renderHook(() => useCallMedia('call1'));
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(startCaptureMock).toHaveBeenCalledTimes(2);

        unmount();

        expect(audioTrack.stop).toHaveBeenCalledOnce();
        expect(videoTrack.stop).toHaveBeenCalledOnce();
    });
});