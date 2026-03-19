import { useChatStore } from '../store/useChatStore';
import { useNavigationStore } from '../store/useNavigationStore';
import { getMimeType } from '../utils/fileUtils';
import { AttachmentType } from '../features/chat/input/AttachmentButton';

export interface PendingFile {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

interface FileTransferApi {
    startTransfer: (params: { upeerId: string; filePath: string; thumbnail?: string; caption?: string }) => Promise<{ success: boolean; fileId?: string }>;
}

export function useFilePersistence(fileTransfer: FileTransferApi) {
    const { 
        contacts, targetUpeerId, pendingFiles, setPendingFiles, 
        setIsDragging, addFileTransferMessage 
    } = useChatStore();
    const { setFilePickerOpen } = useNavigationStore();
    
    const activeContact = contacts.find(c => c.upeerId === targetUpeerId);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!targetUpeerId || activeContact?.status !== 'connected') return;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false);
        if (!targetUpeerId || activeContact?.status !== 'connected') return;
        
        const droppedFilesRaw = Array.from(e.dataTransfer.files);
        const mappedFiles = droppedFilesRaw.map((f: any) => {
            const filePath = window.upeer?.getPathForFile ? window.upeer.getPathForFile(f) : f.path;
            const type = f.type || getMimeType(f.name);
            return { path: filePath, name: f.name, size: f.size, type, lastModified: f.lastModified };
        }).filter(f => !!f.path);

        if (mappedFiles.length > 0) {
            const persistedFiles = await Promise.all(mappedFiles.map(async f => {
                const persistResult = await window.upeer.persistInternalAsset({ filePath: f.path, fileName: f.name });
                if (persistResult.success && persistResult.path) {
                    return { ...f, path: persistResult.path };
                }
                return f;
            }));
            setPendingFiles([...pendingFiles, ...persistedFiles]);
            setFilePickerOpen(true);
        }
    };

    const handleAttachFile = async (type: AttachmentType) => {
        if (!targetUpeerId) return;
        let filters: any[] = [];
        let title = 'Seleccionar archivo';
        switch (type) {
            case 'image': title = 'Seleccionar imagen'; filters = [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]; break;
            case 'video': title = 'Seleccionar video'; filters = [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }]; break;
            case 'audio': title = 'Seleccionar audio'; filters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] }]; break;
            case 'document': title = 'Seleccionar documento'; filters = [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] }]; break;
            default: filters = [{ name: 'Todos los archivos', extensions: ['*'] }];
        }
        try {
            const result = await window.upeer.openFileDialog({ title, filters, multiSelect: true });
            if (result.success && !result.canceled && result.files && result.files.length > 0) {
                const persistedFiles = await Promise.all(result.files.map(async (f: any) => {
                    const persistResult = await window.upeer.persistInternalAsset({ filePath: f.path, fileName: f.name });
                    if (persistResult.success && persistResult.path) {
                        return { ...f, path: persistResult.path };
                    }
                    return f;
                }));
                setPendingFiles([...pendingFiles, ...persistedFiles]);
                setFilePickerOpen(true);
            }
        } catch (error) { console.error('Error opening native file dialog:', error); }
    };

    const handleFileSubmit = async (files: any[], thumbnails?: (string | undefined)[], captions?: string[]) => {
        if (!targetUpeerId) return;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result = await fileTransfer.startTransfer({
                upeerId: targetUpeerId,
                filePath: file.path,
                thumbnail: thumbnails?.[i],
                caption: captions?.[i]
            });
            if (result.success && result.fileId) {
                const tempHash = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                addFileTransferMessage(targetUpeerId, result.fileId, file.name, file.size, file.type, tempHash, thumbnails?.[i] || '', captions?.[i] || '', true);
            }
        }
        setFilePickerOpen(false);
        setPendingFiles([]);
    };

    return {
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleAttachFile,
        handleFileSubmit
    };
}
