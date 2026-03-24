import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FilePreviewOverlay } from '../../../../../src/features/chat/file-preview/FilePreviewOverlay';

vi.mock('../../../../../src/features/chat/file-preview/FilePreviewCarousel.js', () => ({
    FilePreviewCarousel: () => <div data-testid="preview-carousel" />,
}));

vi.mock('../../../../../src/features/chat/file-preview/DragDropPlaceholder.js', () => ({
    DragDropPlaceholder: () => <div data-testid="drag-placeholder" />,
}));

vi.mock('../../../../../src/features/chat/input/EmojiPicker.js', () => ({
    EmojiPicker: () => <div data-testid="emoji-picker" />,
}));

describe('FilePreviewOverlay', () => {
    beforeEach(() => {
        (window as any).upeer = {
            persistInternalAsset: vi.fn().mockResolvedValue({ success: true, path: '/tmp/manual.pdf' }),
            generateVideoThumbnail: vi.fn().mockResolvedValue({ success: false }),
        };
    });

    it('renders an embedded PDF preview before sending', async () => {
        render(
            <FilePreviewOverlay
                files={[{
                    path: '/tmp/manual.pdf',
                    name: 'manual.pdf',
                    size: 2048,
                    type: 'application/pdf',
                    lastModified: Date.now(),
                }]}
                onClose={vi.fn()}
                onSend={vi.fn()}
                onAddMore={vi.fn()}
                onRemove={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByTitle('Vista previa de manual.pdf')).toBeInTheDocument();
        });
    });
});
