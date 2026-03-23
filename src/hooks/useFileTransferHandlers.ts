import { useState } from 'react';
import { AttachmentType } from '../features/chat/input/AttachmentButton.js';
type FileTransferType = {
    startTransfer: (params: { upeerId: string; filePath: string; thumbnail?: string }) => Promise<{ success: boolean; fileId?: string; error?: string }>;
    cancelTransfer: (fileId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
};

interface PendingFile {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

interface UseFileTransferHandlersProps {
    targetUpeerId: string | undefined;
    activeContact: any;
    fileTransfer: FileTransferType;
    addFileTransferMessage: (upeerId: string, fileId: string, fileName: string, fileSize: number, fileType: string, tempHash: string, thumbnail: string, caption: string, isOutgoing: boolean, filePath?: string) => void;
    updateFileTransferMessage: (fileId: string, updates: any) => void;
}

export const useFileTransferHandlers = ({
    targetUpeerId,
    activeContact,
    fileTransfer,
    addFileTransferMessage,
    updateFileTransferMessage: _updateFileTransferMessage,
}: UseFileTransferHandlersProps) => {
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isTransfersExpanded, setIsTransfersExpanded] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const handleAttachFile = async (type: AttachmentType) => {
        if (!targetUpeerId) return;

        // Map internal attachment types to filters
        let filters: any[] = [];
        let title = 'Seleccionar archivo';

        switch (type) {
            case 'image':
                title = 'Seleccionar imagen';
                filters = [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }];
                break;
            case 'video':
                title = 'Seleccionar video';
                filters = [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }];
                break;
            case 'audio':
                title = 'Seleccionar audio';
                filters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] }];
                break;
            case 'document':
                title = 'Seleccionar documento';
                filters = [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] }];
                break;
            default:
                filters = [{ name: 'Todos los archivos', extensions: ['*'] }];
        }

        try {
            const result = await window.upeer.openFileDialog({
                title,
                filters,
                multiSelect: true
            });

            if (result.success && !result.canceled && result.files && result.files.length > 0) {
                setPendingFiles(prev => [...prev, ...(result.files || [])]);
                setIsFilePickerOpen(true);
            }
        } catch (error) {
            console.error('Error opening native file dialog:', error);
        }
    };

    const handleFileSubmit = async (files: PendingFile[], thumbnails?: (string | undefined)[], captions?: string[]) => {
        if (!targetUpeerId) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const thumbnail = thumbnails ? thumbnails[i] : undefined;
            const caption = captions ? captions[i] : undefined;

            try {
                const result = await fileTransfer.startTransfer({
                    upeerId: targetUpeerId,
                    filePath: file.path,
                    thumbnail,
                    caption,
                    fileName: file.name
                });

                if (result.success && result.fileId) {
                    // Add a file transfer message to the chat
                    const tempHash = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    addFileTransferMessage(
                        targetUpeerId,
                        result.fileId,
                        file.name,
                        file.size,
                        file.type,
                        tempHash,
                        thumbnail || '',
                        caption || '',
                        true,
                        file.path
                    );
                } else {
                    console.error('Failed to start transfer for', file.name, ':', result.error);
                }
            } catch (error) {
                console.error('Error starting file transfer for', file.name, ':', error);
            }
        }

        setIsFilePickerOpen(false);
        setPendingFiles([]);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!targetUpeerId || activeContact?.status !== 'connected') return;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only trigger dragleave if we are actually leaving the container, not just hovering over a child element
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!targetUpeerId || activeContact?.status !== 'connected') return;

        // In Electron 30+, File objects hide the path property. 
        // We use the webUtils.getPathForFile helper exposed in preload.ts
        const droppedFilesRaw = Array.from(e.dataTransfer.files);

        const mappedFiles = droppedFilesRaw.map((f: any) => {
            const filePath = window.upeer?.getPathForFile ? window.upeer.getPathForFile(f) : f.path;
            return {
                path: filePath,
                name: f.name,
                size: f.size,
                type: f.type || 'application/octet-stream',
                lastModified: f.lastModified
            } as PendingFile;
        }).filter((f: any) => !!f.path);

        if (mappedFiles.length > 0) {

            // We append dropped files to pendingFiles to support dropping multiple times
            setPendingFiles(prev => {
                const newFiles = [...prev];
                mappedFiles.forEach(mf => {
                    if (!newFiles.some(pf => pf.path === mf.path)) {
                        newFiles.push(mf);
                    }
                });
                return newFiles;
            });
            setIsFilePickerOpen(true);
        }
    };

    const handleCancelTransfer = async (fileId: string) => {
        await fileTransfer.cancelTransfer(fileId, 'User cancelled');
    };

    return {
        isFilePickerOpen,
        setIsFilePickerOpen,
        isTransfersExpanded,
        setIsTransfersExpanded,
        pendingFiles,
        setPendingFiles,
        isDragging,
        setIsDragging,
        handleAttachFile,
        handleFileSubmit,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleCancelTransfer,
    };
};