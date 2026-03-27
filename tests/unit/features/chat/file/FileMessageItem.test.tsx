import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileMessageItem } from '../../../../../src/features/chat/file/FileMessageItem';

vi.mock('../../../../../src/features/chat/file/MediaFileMessage.js', () => ({
    MediaFileMessage: () => <div data-testid="media-file-message" />,
}));

type DocumentFileMessageProps = {
    onOpen?: () => void;
};

vi.mock('../../../../../src/features/chat/file/DocumentFileMessage.js', () => ({
    DocumentFileMessage: ({ onOpen }: DocumentFileMessageProps) => <button data-testid="document-file-message" onClick={onOpen} />,
}));

vi.mock('../../../../../src/features/chat/file/AudioPlayer.js', () => ({
    AudioPlayer: () => <div data-testid="audio-player" />,
}));

vi.mock('../../../../../src/utils/fileUtils.js', () => ({
    isPdfFile: (mimeType: string, fileName?: string) => mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf'),
    toMediaUrl: (path: string) => `media://${path}`,
}));

describe('FileMessageItem', () => {
    it('renders AudioPlayer for a voice note even if mime is audio/webm', () => {
        render(
            <FileMessageItem
                data={{
                    fileId: 'voice-1',
                    fileName: 'voice_note.webm',
                    fileSize: 2048,
                    mimeType: 'audio/webm',
                    fileHash: 'hash-1',
                    savedPath: '/tmp/voice_note.webm',
                    transferState: 'completed',
                    direction: 'receiving',
                    isVoiceNote: true,
                }}
                isMe={false}
                status="delivered"
            />
        );

        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
        expect(screen.queryByTestId('media-file-message')).not.toBeInTheDocument();
        expect(screen.queryByTestId('document-file-message')).not.toBeInTheDocument();
    });

    it('opens PDFs in the internal viewer callback', () => {
        const onMediaClick = vi.fn();
        const onOpen = vi.fn();

        render(
            <FileMessageItem
                data={{
                    fileId: 'pdf-1',
                    fileName: 'manual.pdf',
                    fileSize: 4096,
                    mimeType: 'application/pdf',
                    fileHash: 'hash-pdf',
                    savedPath: '/tmp/manual.pdf',
                    transferState: 'completed',
                    direction: 'receiving',
                }}
                isMe={false}
                status="delivered"
                onMediaClick={onMediaClick}
                onOpen={onOpen}
            />
        );

        fireEvent.click(screen.getByTestId('document-file-message'));

        expect(onMediaClick).toHaveBeenCalledWith({
            url: '/tmp/manual.pdf',
            name: 'manual.pdf',
            mimeType: 'application/pdf',
            fileId: 'pdf-1',
        });
        expect(onOpen).not.toHaveBeenCalled();
    });
});
