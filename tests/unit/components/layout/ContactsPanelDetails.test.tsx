import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '../../../../src/types/chat.js';
import { ContactsPanelDetails } from '../../../../src/components/layout/ContactsPanelDetails.js';

describe('ContactsPanelDetails call actions', () => {
    afterEach(cleanup);

    it('starts audio and video calls for the selected contact', () => {
        const contact: Contact = { upeerId: 'peer-1', address: 'address', name: 'Ana', status: 'connected' };
        const onCallAudio = vi.fn();
        const onCallVideo = vi.fn();

        render(<ContactsPanelDetails
            activeContact={contact}
            commonGroups={[]}
            isOnline
            lastSeenText={null}
            onOpenChat={vi.fn()}
            onBlockContact={vi.fn()}
            onUnblockContact={vi.fn()}
            onDeleteRequest={vi.fn()}
            onCallAudio={onCallAudio}
            onCallVideo={onCallVideo}
            callsUnavailable={false}
        />);

        fireEvent.click(screen.getByRole('button', { name: 'Llamar a Ana' }));
        fireEvent.click(screen.getByRole('button', { name: 'Videollamar a Ana' }));

        expect(onCallAudio).toHaveBeenCalledWith('peer-1');
        expect(onCallVideo).toHaveBeenCalledWith('peer-1');
    });
});