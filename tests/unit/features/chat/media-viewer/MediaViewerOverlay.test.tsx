import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaViewerOverlay } from '../../../../../src/features/chat/media-viewer/MediaViewerOverlay';

vi.mock('../../../../../src/components/ui/UnsupportedVideoFallback.js', () => ({
    UnsupportedVideoFallback: () => <div data-testid="unsupported-video" />,
}));

vi.mock('../../../../../src/utils/videoPlayback.js', () => ({
    isVideoFile: () => false,
    supportsInlineVideoPlayback: () => false,
    getInlineVideoUnsupportedReason: () => null,
}));

describe('MediaViewerOverlay', () => {
    beforeEach(() => {
        (window as any).upeer = {
            openFile: vi.fn().mockResolvedValue({ success: true }),
            generateVideoThumbnail: vi.fn().mockResolvedValue({ success: false }),
        };
    });

    it('renders an embedded PDF preview for pdf items', () => {
        render(
            <MediaViewerOverlay
                items={[{
                    url: '/tmp/manual.pdf',
                    fileName: 'manual.pdf',
                    mimeType: 'application/pdf',
                    fileId: 'pdf-1',
                }]}
                initialIndex={0}
                onClose={vi.fn()}
                onDownload={vi.fn()}
            />
        );

        expect(screen.getByTitle('Vista previa de manual.pdf')).toBeInTheDocument();
    });
});
