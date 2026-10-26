import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageStatus } from '../../../../../src/features/chat/message/MessageStatus.js';
import { useChatStore } from '../../../../../src/store/useChatStore.js';

const initialSyncStatus = useChatStore.getState().syncStatus;

const setPendingEntities = (pendingEntityIds: string[]) => {
    useChatStore.setState({
        syncStatus: {
            state: 'pending',
            phase: 'live',
            devicesTotal: 1,
            devicesDone: 0,
            lastPeerAt: 0,
            ageMillis: 0,
            pendingEvents: pendingEntityIds.length,
            pendingMessages: pendingEntityIds.length,
            pendingMetadata: 0,
            pendingEntityIds,
            peers: [],
            devices: [],
            progress: {
                determinate: false,
                percent: 0,
                historyDone: 0,
                historyTotal: 0,
                historyKnown: false,
                pendingMessages: pendingEntityIds.length,
                pendingFiles: 0,
                headline: 'Sincronizando tus dispositivos…',
                detail: 'Conectando con tus dispositivos',
            },
        },
    });
};

describe('MessageStatus sync state', () => {
    afterEach(() => {
        useChatStore.setState({ syncStatus: initialSyncStatus });
    });

    it('marks a message as pending while it is not replicated to every device', () => {
        setPendingEntities(['msg-1']);
        render(<MessageStatus status="sent" messageId="msg-1" />);
        expect(screen.getByLabelText('Pendiente de sincronizar con tus dispositivos')).toBeTruthy();
    });

    it('does not mark a message that is already replicated', () => {
        setPendingEntities([]);
        render(<MessageStatus status="sent" messageId="msg-1" />);
        expect(screen.queryByLabelText('Pendiente de sincronizar con tus dispositivos')).toBeNull();
    });

    it('does not mark messages without an identifier', () => {
        setPendingEntities(['msg-1']);
        render(<MessageStatus status="sent" />);
        expect(screen.queryByLabelText('Pendiente de sincronizar con tus dispositivos')).toBeNull();
    });
});
