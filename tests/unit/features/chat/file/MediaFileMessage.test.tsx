import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MediaFileMessage } from '../../../../../src/features/chat/file/MediaFileMessage';
import React from 'react';

describe('MediaFileMessage Component', () => {
    const defaultProps = {
        fileId: '1',
        fileName: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        isMe: true,
        isVideo: false,
        status: 'sent',
        isTransferComplete: true,
        isTransferInProgress: false,
        isTransferFailed: false,
        safeProgress: 100,
        isDownloading: false,
        onOpen: vi.fn(),
        onCancel: vi.fn(),
        onRetry: vi.fn(),
        onDownload: vi.fn(),
        onMediaClick: vi.fn(),
    };

    it('should be clickable if I am the sender even without savedPath', () => {
        const { getByTestId } = render(
            <MediaFileMessage 
                {...defaultProps} 
                isMe={true} 
                savedPath={undefined} 
                thumbnail="data:image/jpeg;base64,thumb"
                isImage={true}
            />
        );
        
        const container = getByTestId('media-file-message-container');
        fireEvent.click(container);
        
        expect(defaultProps.onMediaClick).toHaveBeenCalledWith(expect.objectContaining({
            url: 'data:image/jpeg;base64,thumb'
        }));
    });

    it('should NOT call onMediaClick if NOT complete and receiver', () => {
        const onMediaClick = vi.fn();
        const { getByTestId } = render(
            <MediaFileMessage 
                {...defaultProps} 
                isMe={false} 
                isTransferComplete={false}
                savedPath={undefined} 
                onMediaClick={onMediaClick}
                isImage={true}
            />
        );
        
        const container = getByTestId('media-file-message-container');
        fireEvent.click(container);
        expect(onMediaClick).not.toHaveBeenCalled();
    });

    describe('previsualización mientras se recibe', () => {
        const streamingTransfer = {
            ...defaultProps,
            fileId: 'recv-1',
            isMe: false,
            isVideo: true,
            isImage: false,
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
            status: 'receiving',
            isTransferComplete: false,
            isTransferInProgress: true,
            transferState: 'active',
            safeProgress: 42,
            thumbnail: undefined,
            savedPath: undefined,
        };

        beforeEach(() => {
            Object.assign(window, { upeer: { ...(window as unknown as { upeer?: object }).upeer } });
        });

        afterEach(() => {
            delete (window as unknown as { upeer?: { getStreamPreview?: unknown } }).upeer?.getStreamPreview;
        });

        it('ofrece abrir el vídeo recibido con el prefijo contiguo', async () => {
            const onMediaClick = vi.fn();
            Object.assign(window.upeer as object, {
                getStreamPreview: vi.fn().mockResolvedValue({
                    success: true,
                    tempPath: '/tmp/chat-p2p-recv-1.tmp',
                    contiguousBytes: 2_000_000,
                    totalBytes: 9_000_000,
                }),
            });

            render(<MediaFileMessage {...streamingTransfer} onMediaClick={onMediaClick} />);

            const chip = await waitFor(() => {
                const found = document.querySelector('[data-testid="stream-preview-chip"]');
                expect(found).not.toBeNull();
                return found as HTMLElement;
            });
            fireEvent.click(chip);

            expect(onMediaClick).toHaveBeenCalledWith(expect.objectContaining({
                url: 'media:///tmp/chat-p2p-recv-1.tmp?limit=2000000',
                fileId: 'recv-1',
            }));
        });

        it('no ofrece nada si todavía no hay prefijo reproducible', async () => {
            Object.assign(window.upeer as object, {
                getStreamPreview: vi.fn().mockResolvedValue({ success: false }),
            });

            render(<MediaFileMessage {...streamingTransfer} />);

            await waitFor(() => expect((window.upeer as { getStreamPreview: unknown }).getStreamPreview).toHaveBeenCalled());
            expect(document.querySelector('[data-testid="stream-preview-chip"]')).toBeNull();
        });

        it('no consulta el estado cuando la transferencia ya terminó', async () => {
            const spy = vi.fn().mockResolvedValue({ success: false });
            Object.assign(window.upeer as object, { getStreamPreview: spy });

            render(<MediaFileMessage {...streamingTransfer} isTransferComplete={true} isTransferInProgress={false} transferState="completed" />);

            expect(spy).not.toHaveBeenCalled();
        });
    });
});
