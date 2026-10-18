import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallStore } from '../../../../src/features/call/useCallStore.js';
import { useNavigationStore } from '../../../../src/store/useNavigationStore.js';

const audioMocks = vi.hoisted(() => ({ play: vi.fn(), pause: vi.fn() }));
const audioInstances: Array<{ loop: boolean; currentTime: number; src: string }> = [];

vi.mock('../../../../resources/sound/call-sound.mp3?url', () => ({ default: '/call-sound.mp3' }));
vi.mock('../../../../src/features/call/CallIncomingModal.js', () => ({ CallIncomingModal: () => null }));
vi.mock('../../../../src/features/call/CallWindow.js', () => ({ CallWindow: ({ compact, onExpand }: { compact?: boolean; onExpand?: () => void }) => <button data-testid="call-window" data-compact={String(compact)} onClick={onExpand}>Abrir llamada</button> }));
vi.mock('../../../../src/features/call/useCall.js', () => ({
    useCall: () => ({
        activeCalls: Object.values(useCallStore((state) => state.calls)),
        acceptCall: vi.fn(),
        rejectCall: vi.fn(),
        toggleMute: vi.fn(),
        toggleCamera: vi.fn(),
        endCall: vi.fn(),
    }),
}));

import { CallHost } from '../../../../src/features/call/CallHost.js';

describe('CallHost incoming ringtone', () => {
    beforeEach(() => {
        audioInstances.length = 0;
        audioMocks.play.mockReset().mockResolvedValue(undefined);
        audioMocks.pause.mockReset();
        vi.stubGlobal('Audio', class {
            loop = false;
            currentTime = 0;
            play = audioMocks.play;
            pause = audioMocks.pause;
            constructor(public src: string) {
                audioInstances.push(this);
            }
        });
        useCallStore.getState().reset();
        useNavigationStore.getState().goToChat();
    });

    afterEach(() => {
        cleanup();
        useCallStore.getState().reset();
        useNavigationStore.getState().goToChat();
        vi.unstubAllGlobals();
    });

    it('reproduce en bucle al entrar una llamada y para cuando deja de sonar', () => {
        const { rerender } = render(<CallHost appView="chat" contacts={[]} groups={[]} />);

        act(() => useCallStore.getState().setFromIncoming({ callId: 'incoming-1', peerUpeerId: 'peer-1', kind: 'audio' }));
        rerender(<CallHost appView="chat" contacts={[]} groups={[]} />);

        expect(audioMocks.play).toHaveBeenCalledOnce();
        const audio = audioInstances[0];
        expect(audio.loop).toBe(true);
        expect(audio.src).toBe('/call-sound.mp3');

        act(() => useCallStore.getState().markConnected('incoming-1'));
        rerender(<CallHost appView="chat" contacts={[]} groups={[]} />);

        expect(audioMocks.pause).toHaveBeenCalledOnce();
    });

    it('muestra la llamada compacta en Chats y abre la vista completa al pulsarla', () => {
        const { rerender, getByTestId } = render(<CallHost appView="chat" contacts={[]} groups={[]} />);
        act(() => useCallStore.getState().setStarted('active-1', 'peer-1', 'video'));
        rerender(<CallHost appView="chat" contacts={[]} groups={[]} />);

        expect(getByTestId('call-window').getAttribute('data-compact')).toBe('true');
        act(() => getByTestId('call-window').click());
        expect(useNavigationStore.getState().appView).toBe('calls');
    });
});