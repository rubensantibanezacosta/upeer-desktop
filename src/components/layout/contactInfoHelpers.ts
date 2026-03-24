import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import SecurityIcon from '@mui/icons-material/Security';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { Contact } from '../../types/chat.js';

export const getStatusMeta = (contact: Contact, isOnline: boolean) => {
    if (contact.status === 'blocked') return { label: 'Bloqueado', color: 'danger' as const };
    if (contact.status === 'incoming') return { label: 'Solicitud recibida', color: 'primary' as const };
    if (contact.status === 'pending') return { label: 'Pendiente', color: 'warning' as const };
    if (isOnline || contact.status === 'connected') return { label: 'Disponible', color: 'success' as const };
    return { label: 'Sin conexión', color: 'neutral' as const };
};

export const getTrustMeta = (score?: number) => {
    if (score === undefined) return null;
    if (score < 40) return { label: 'Baja reputación · Ten cuidado', Icon: GppMaybeIcon };
    if (score >= 80) return { label: 'Alta reputación · Muy confiable', Icon: VerifiedUserIcon };
    if (score >= 65) return { label: 'Buena reputación · Confiable', Icon: CheckCircleIcon };
    if (score === 50) return { label: 'Sin historial en la red', Icon: NewReleasesIcon };
    return { label: 'Reputación estándar', Icon: SecurityIcon };
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
    const mime = mimeType?.toLowerCase() || '';
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts', 'ogg'];
    return mime.startsWith('image/') || mime.startsWith('video/') || imageExts.includes(ext) || videoExts.includes(ext);
};

export const isVideoMediaFile = (mimeType?: string, fileName?: string): boolean => {
    const mime = mimeType?.toLowerCase() || '';
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts', 'ogg'];
    return mime.startsWith('video/') || videoExts.includes(ext);
};
