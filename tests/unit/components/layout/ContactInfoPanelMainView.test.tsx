import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContactInfoPanelMainView } from '../../../../src/components/layout/ContactInfoPanelMainView.js';

describe('ContactInfoPanelMainView call and search actions', () => {
    it('invokes audio call, video call and chat search actions', () => {
        const onCallAudio = vi.fn();
        const onCallVideo = vi.fn();
        const onOpenSearch = vi.fn();
        render(
            <ContactInfoPanelMainView
                contact={{ upeerId: 'peer-1', name: 'Ana', address: 'address', status: 'connected' }}
                isOnline
                lastSeenText={null}
                trust={null}
                sharedMedia={[]}
                utilityActions={[]}
                dangerActions={[]}
                onClose={vi.fn()}
                onOpenMedia={vi.fn()}
                onViewAllMedia={vi.fn()}
                onOpenCipher={vi.fn()}
                onCallAudio={onCallAudio}
                onCallVideo={onCallVideo}
                onOpenSearch={onOpenSearch}
                callsUnavailable={false}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Llamar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Videollamar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }));

        expect(onCallAudio).toHaveBeenCalledOnce();
        expect(onCallVideo).toHaveBeenCalledOnce();
        expect(onOpenSearch).toHaveBeenCalledOnce();
    });
});