import React, { useEffect, useRef, useState } from 'react';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { generatePdfThumbnail } from '../file/pdfThumbnail.js';
import { getMimeType, isPdfFile, toMediaUrl } from '../../../utils/fileUtils.js';

export interface FileInfo {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

export const useFilesPreview = (files: FileInfo[]) => {
    const [previews, setPreviews] = useState<Record<string, { previewUrl: string; thumbnail: string }>>({});
    const [assetPaths, setAssetPaths] = useState<Record<string, string>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const processingRef = useRef(new Set<string>());

    const generateThumbnail = (imageUrl: string): Promise<string> =>
        new Promise((resolve) => {
            let settled = false;
            const resolveOnce = (value: string) => { if (!settled) { settled = true; resolve(value); } };
            const timeout = setTimeout(() => resolveOnce(''), 5000);
            const img = new Image();
            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    if (!context) {
                        resolveOnce('');
                        return;
                    }
                    const maxSize = 240;
                    let { width, height } = img;
                    if (width > height) {
                        if (width > maxSize) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        }
                    } else if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    context.drawImage(img, 0, 0, width, height);
                    resolveOnce(canvas.toDataURL('image/jpeg', 0.7));
                } catch {
                    resolveOnce('');
                }
            };
            img.onerror = () => { clearTimeout(timeout); resolveOnce(''); };
            img.crossOrigin = 'anonymous';
            img.src = imageUrl;
        });

    const generateVideoThumbnail = (videoUrl: string): Promise<string> =>
        new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = videoUrl;
            video.muted = true;
            video.playsInline = true;
            const timeout = setTimeout(() => { video.onseeked = null; video.onerror = null; resolve(''); }, 5000);
            video.onloadedmetadata = () => { video.currentTime = Math.min(1, video.duration * 0.1); };
            video.onseeked = () => {
                clearTimeout(timeout);
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) {
                    resolve('');
                    return;
                }
                const maxSize = 240;
                let { videoWidth: width, videoHeight: height } = video;
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
                canvas.width = width;
                canvas.height = height;
                context.drawImage(video, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            video.onerror = () => { clearTimeout(timeout); resolve(''); };
        });

    useEffect(() => {
        const currentPaths = new Set(files.map((file) => file.path));
        for (const path of processingRef.current) {
            if (!currentPaths.has(path)) {
                processingRef.current.delete(path);
            }
        }

        const unprocessed = files.filter((file) => !processingRef.current.has(file.path));
        if (unprocessed.length === 0) {
            return;
        }

        for (const file of unprocessed) {
            processingRef.current.add(file.path);
        }

        setIsGenerating(true);

        const process = async () => {
            for (const file of unprocessed) {
                let assetPath = file.path;
                try {
                    const result = await window.upeer.persistInternalAsset({ filePath: file.path, fileName: file.name });
                    if (result?.success && result.path) {
                        assetPath = result.path;
                    }
                } catch {
                    assetPath = file.path;
                }

                setAssetPaths((prev) => ({ ...prev, [file.path]: assetPath }));

                let effectiveType = file.type;
                if (!effectiveType || effectiveType === 'application/octet-stream') {
                    effectiveType = getMimeType(file.name);
                }

                let thumbnail = '';
                let previewUrl = '';

                if (effectiveType.startsWith('image/')) {
                    previewUrl = toMediaUrl(assetPath);
                    thumbnail = await generateThumbnail(previewUrl);
                } else if (effectiveType.startsWith('video/')) {
                    previewUrl = toMediaUrl(assetPath);
                    try {
                        const result = await window.upeer.generateVideoThumbnail(assetPath);
                        thumbnail = result.success ? result.dataUrl : await generateVideoThumbnail(previewUrl);
                    } catch {
                        thumbnail = await generateVideoThumbnail(previewUrl);
                    }
                } else if (isPdfFile(effectiveType, file.name)) {
                    previewUrl = toMediaUrl(assetPath);
                    try {
                        thumbnail = await generatePdfThumbnail(previewUrl);
                    } catch {
                        thumbnail = '';
                    }
                }

                setPreviews((prev) => ({ ...prev, [file.path]: { previewUrl, thumbnail } }));
            }
            setIsGenerating(false);
        };

        void process();
    }, [files]);

    return { previews, isGenerating, assetPaths };
};

export const getFileTypeIcon = (fileType: string, fileName: string, size = 60) => {
    let effectiveType = fileType;
    if (!effectiveType || effectiveType === 'application/octet-stream') {
        effectiveType = getMimeType(fileName);
    }
    if (effectiveType.startsWith('image/')) return <ImageIcon sx={{ fontSize: size }} />;
    if (effectiveType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: size }} />;
    if (effectiveType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: size }} />;
    if (effectiveType.includes('pdf')) return <DescriptionIcon sx={{ fontSize: size }} />;
    return <InsertDriveFileIcon sx={{ fontSize: size }} />;
};