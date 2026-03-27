import { useEffect, useState } from 'react';
import { isPdfFile } from '../../../utils/fileUtils.js';
import { isVideoFile } from '../../../utils/videoPlayback.js';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];
export const THUMB_WIDTH = 56;
export const THUMB_GAP = 12;
export const VISIBLE_BUFFER = 2;

export interface MediaItem {
    url: string;
    fileName: string;
    mimeType: string;
    fileId: string;
    messageId?: string;
    thumbnail?: string;
    senderName?: string;
    senderAvatar?: string;
    timestamp?: string;
}

export interface MediaViewerOverlayProps {
    items: MediaItem[];
    initialIndex: number;
    onClose: () => void;
    onDownload: (item: MediaItem) => void;
    onReply?: (item: MediaItem) => void;
    onForward?: (item: MediaItem) => void;
    onReact?: (item: MediaItem, emoji: string) => void;
    onGoToMessage?: (item: MediaItem) => void;
}

export const isVideo = (mime: string, fileName?: string) => isVideoFile(mime, fileName);

export const useVideoThumbnails = (items: MediaItem[], currentIndex: number) => {
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

    useEffect(() => {
        let isMounted = true;
        const generateVisible = async () => {
            const start = Math.max(0, currentIndex - VISIBLE_BUFFER);
            const end = Math.min(items.length - 1, currentIndex + VISIBLE_BUFFER);

            for (let index = start; index <= end; index++) {
                if (!isMounted) {
                    break;
                }
                const item = items[index];
                const hasThumbnail = item.thumbnail && item.thumbnail.length > 10;
                if (hasThumbnail || thumbnails[item.fileId] || !isVideo(item.mimeType, item.fileName) || !item.url) {
                    continue;
                }

                try {
                    const filePath = item.url.replace(/\\/g, '/');
                    const result = await window.upeer.generateVideoThumbnail(filePath);
                    if (isMounted && result.success) {
                        setThumbnails((prev) => ({ ...prev, [item.fileId]: result.dataUrl }));
                    }
                } catch {
                    continue;
                }
            }
        };

        void generateVisible();
        return () => { isMounted = false; };
    }, [items, currentIndex, thumbnails]);

    return thumbnails;
};

export const isImageThumbnailItem = (item: MediaItem) => !isVideo(item.mimeType, item.fileName) && !isPdfFile(item.mimeType, item.fileName);