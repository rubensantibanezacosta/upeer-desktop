import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const wavesurferMocks = vi.hoisted(() => {
    const instance: Record<string, ReturnType<typeof vi.fn>> = {};
    const create = vi.fn((_opts: unknown) => {
        Object.assign(instance, {
            on: vi.fn(),
            getDuration: vi.fn(() => 65),
            getCurrentTime: vi.fn(() => 30),
            setTime: vi.fn(),
            playPause: vi.fn(),
            destroy: vi.fn(),
        });
        return instance;
    });
    return { create, instance };
});

vi.mock('wavesurfer.js', () => ({
    default: { create: wavesurferMocks.create },
}));

vi.mock('@mui/icons-material/PlayArrow', () => ({ default: () => <span data-testid="PlayArrowIcon" /> }));
vi.mock('@mui/icons-material/Pause', () => ({ default: () => <span data-testid="PauseIcon" /> }));
vi.mock('@mui/icons-material/Close', () => ({ default: () => <span /> }));

import { AudioPlayer } from '../../../../../src/features/chat/file/AudioPlayer';

describe('AudioPlayer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        wavesurferMocks.create.mockClear();
        Object.keys(wavesurferMocks.instance).forEach((k) => wavesurferMocks.instance[k].mockClear?.());
    });

    it('crea wavesurfer con la url y muestra la duración al estar listo', () => {
        render(<AudioPlayer url="media:///tmp/a.webm" isMe={false} timestamp="12:00" status="delivered" />);
        expect(wavesurferMocks.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'media:///tmp/a.webm' }));

        const ws = wavesurferMocks.create.mock.results[0].value;
        const readyHandler = ws.on.mock.calls.find((c: [string, () => void]) => c[0] === 'ready')?.[1];
        act(() => readyHandler?.());
        expect(screen.getByText('1:05')).toBeTruthy();
    });

    it('alterna play/pause y muestra el tiempo actual mientras reproduce', () => {
        render(<AudioPlayer url="media:///tmp/a.webm" isMe />);
        const ws = wavesurferMocks.create.mock.results[0].value;

        const readyHandler = ws.on.mock.calls.find((c: [string, () => void]) => c[0] === 'ready')?.[1];
        act(() => readyHandler?.());

        const playHandler = ws.on.mock.calls.find((c: [string, () => void]) => c[0] === 'play')?.[1];
        act(() => playHandler?.());
        expect(screen.getByTestId('PauseIcon')).toBeTruthy();

        const audioprocess = ws.on.mock.calls.find((c: [string, () => void]) => c[0] === 'audioprocess')?.[1];
        act(() => audioprocess?.());
        expect(screen.getByText('0:30')).toBeTruthy();

        fireEvent.click(screen.getByRole('button'));
        expect(ws.playPause).toHaveBeenCalled();
    });

    it('detiene la reproducción al terminar y resetea el tiempo', () => {
        render(<AudioPlayer url="media:///tmp/a.webm" isMe={false} />);
        const ws = wavesurferMocks.create.mock.results[0].value;

        const finishHandler = ws.on.mock.calls.find((c: [string, () => void]) => c[0] === 'finish')?.[1];
        act(() => finishHandler?.());
        expect(ws.setTime).toHaveBeenCalledWith(0);
    });

    it('destruye la instancia al desmontar', () => {
        const { unmount } = render(<AudioPlayer url="media:///tmp/a.webm" isMe={false} />);
        const ws = wavesurferMocks.create.mock.results[0].value;
        unmount();
        expect(ws.destroy).toHaveBeenCalled();
    });
});
