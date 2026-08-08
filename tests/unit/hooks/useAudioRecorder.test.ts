import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioRecorder } from '../../../src/hooks/useAudioRecorder';

class MockMediaRecorder {
    static isTypeSupported = vi.fn(() => true);
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    stream: MediaStream;
    mimeType: string;

    constructor(stream: MediaStream, opts: { mimeType?: string } = {}) {
        this.stream = stream;
        this.mimeType = opts.mimeType || 'audio/webm;codecs=opus';
    }

    start() { this.state = 'recording'; }
    stop() {
        this.state = 'inactive';
        this.onstop?.();
    }
}

const mockTrack = { stop: vi.fn() };
const mockStream = { getTracks: () => [mockTrack] } as unknown as MediaStream;

function stubMedia() {
    vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('Blob', class { type = 'audio/webm'; });
    vi.stubGlobal('File', class { name = 'voice_note_1.webm'; type = 'audio/webm'; });
}

describe('useAudioRecorder', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        stubMedia();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('inicia la grabación y acumula duración', async () => {
        const { result } = renderHook(() => useAudioRecorder());

        await act(async () => {
            await result.current.startRecording();
        });

        expect(result.current.isRecording).toBe(true);
        expect(result.current.stream).toBe(mockStream);
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });

        await act(async () => { vi.advanceTimersByTime(3000); });
        expect(result.current.duration).toBe(3);
    });

    it('detiene la grabación y devuelve un File', async () => {
        const { result } = renderHook(() => useAudioRecorder());
        await act(async () => { await result.current.startRecording(); });

        let file: File | null = null;
        await act(async () => {
            file = await result.current.stopRecording();
        });

        expect(result.current.isRecording).toBe(false);
        expect(file).toBeInstanceOf(File);
        expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('cancela la grabación y limpia los chunks', async () => {
        const { result } = renderHook(() => useAudioRecorder());
        await act(async () => { await result.current.startRecording(); });

        act(() => result.current.cancelRecording());
        expect(result.current.isRecording).toBe(false);
        expect(result.current.duration).toBe(0);
        expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('maneja el error de acceso al micrófono', async () => {
        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('denied'));
        const { result } = renderHook(() => useAudioRecorder());

        await act(async () => { await result.current.startRecording(); });

        expect(result.current.isRecording).toBe(false);
        expect(result.current.error).toBe('denied');
    });
});
