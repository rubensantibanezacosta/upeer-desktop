import { BadgeCheck, CircleCheck, ShieldAlert, Shield, Sparkles } from 'lucide-react';
import { isPreviewableFile } from '../../utils/fileUtils.js';

export const getTrustMeta = (score?: number) => {
    if (score === undefined) return null;
    if (score < 40) return { label: 'Baja reputación · Ten cuidado', Icon: ShieldAlert };
    if (score >= 80) return { label: 'Alta reputación · Muy confiable', Icon: BadgeCheck };
    if (score >= 65) return { label: 'Buena reputación · Confiable', Icon: CircleCheck };
    if (score === 50) return { label: 'Sin historial en la red', Icon: Sparkles };
    return { label: 'Reputación estándar', Icon: Shield };
};

export const formatSeen = (iso?: string): string | null => {
    if (!iso) return null;
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24 && date.toDateString() === new Date().toDateString())
        return `hoy a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return `el ${date.toLocaleDateString([], { day: '2-digit', month: 'short' })}`;
};

export const isMediaFile = (mimeType?: string, fileName?: string, isVoiceNote = false): boolean => {
    if (isVoiceNote) return false;
    return isPreviewableFile(mimeType, fileName);
};

export const isVideoMediaFile = (mimeType?: string, fileName?: string): boolean => {
    const mime = mimeType?.toLowerCase() || '';
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts', 'ogg'];
    return mime.startsWith('video/') || videoExts.includes(ext);
};
