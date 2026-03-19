import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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
});
