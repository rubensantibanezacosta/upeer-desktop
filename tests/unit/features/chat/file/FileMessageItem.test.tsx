import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileMessageItem } from '../../../../../src/features/chat/file/FileMessageItem';

vi.mock('../../../../../src/features/chat/file/MediaFileMessage.js', () => ({
    MediaFileMessage: () => <div data-testid="media-file-message" />,
}));

vi.mock('../../../../../src/features/chat/file/DocumentFileMessage.js', () => ({
    DocumentFileMessage: () => <div data-testid="document-file-message" />,
}));

vi.mock('../../../../../src/features/chat/file/AudioPlayer.js', () => ({
    AudioPlayer: () => <div data-testid="audio-player" />,
}));

vi.mock('../../../../../src/utils/fileUtils.js', () => ({
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
});
