import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/joy';
import type { Identity } from './types.js';
import { resizeImageToDataUrl } from './shared.js';
import {
    DEFAULT_REPUTATION,
    type InfoKey,
    type ReputationData,
    ProfileAddressSection,
    ProfileHeroSection,
    ProfileStatsSection,
    ProfileTechnicalSection,
} from './profileSectionBlocks.js';
import { ProfileInfoModal, ProfileQrModal } from './profileSectionModals.js';

interface Props {
    identity: Identity | null;
    networkAddress: string;
    onIdentityUpdate?: () => void;
}

export const SectionPerfil: React.FC<Props> = ({ identity, networkAddress, onIdentityUpdate }) => {
    const [alias, setAlias] = useState(identity?.alias || '');
    const [avatar, setAvatar] = useState(identity?.avatar || '');
    const [isEditingAlias, setIsEditingAlias] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [myReputation, setMyReputation] = useState<ReputationData | null>(null);
    const [vaultStats, setVaultStats] = useState<{ count: number; sizeBytes: number } | null>(null);
    const [activeInfo, setActiveInfo] = useState<InfoKey | null>(null);
    const [showQR, setShowQR] = useState(false);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleInfo = (key: InfoKey) =>
        setActiveInfo(prev => prev === key ? null : key);

    const addr = identity?.address || networkAddress || '';
    const fullId = identity ? `${identity.upeerId}@${addr}` : '';
    const displayName = alias || identity?.upeerId || 'Mi cuenta';

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(fullId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [fullId]);

    useEffect(() => {
        if (identity?.alias != null) setAlias(identity.alias);
        if (identity?.avatar != null) setAvatar(identity.avatar);
    }, [identity?.alias, identity?.avatar]);

    useEffect(() => {
        const fetchReputation = () => {
            if (!window.upeer.getMyReputation) {
                setMyReputation(DEFAULT_REPUTATION);
                return;
            }
            window.upeer.getMyReputation()
                .then((reputation: any) => {
                    if (reputation && typeof reputation.vouchScore === 'number') {
                        setMyReputation({ vouchScore: reputation.vouchScore, connectionCount: reputation.connectionCount ?? 0 });
                    } else {
                        setMyReputation(DEFAULT_REPUTATION);
                    }
                })
                .catch(() => setMyReputation(DEFAULT_REPUTATION));
        };
        fetchReputation();
        window.upeer.getVaultStats?.().then(setVaultStats).catch(() => setVaultStats(null));
        window.upeer.onReputationUpdated?.(fetchReputation);
    }, []);

    const handleAvatarClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await resizeImageToDataUrl(file);
            setAvatar(dataUrl);
            await window.upeer.setMyAvatar(dataUrl);
            onIdentityUpdate?.();
        } catch {
            setAvatar(identity?.avatar || '');
        }
        e.target.value = '';
    };

    const saveAlias = useCallback(async () => {
        const trimmed = alias.trim();
        setIsSaving(true);
        try {
            await window.upeer.setMyAlias(trimmed);
            onIdentityUpdate?.();
        } finally {
            setIsSaving(false);
            setIsEditingAlias(false);
        }
    }, [alias, onIdentityUpdate]);

    const fmtBytes = (bytes: number) => {
        if (bytes === 0) {
            return '0 B';
        }
        const base = 1024;
        const units = ['B', 'KB', 'MB', 'GB'];
        const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
        return (bytes / Math.pow(base, unitIndex)).toFixed(1) + ' ' + units[unitIndex];
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <ProfileHeroSection
                avatar={avatar}
                alias={alias}
                identityId={identity?.upeerId}
                displayName={displayName}
                isEditingAlias={isEditingAlias}
                isSaving={isSaving}
                fileInputRef={fileInputRef}
                onAvatarClick={handleAvatarClick}
                onFileChange={handleFileChange}
                onAliasChange={setAlias}
                onAliasEdit={() => setIsEditingAlias(true)}
                onAliasCancel={() => setIsEditingAlias(false)}
                onAliasSave={saveAlias}
            />
            <ProfileStatsSection myReputation={myReputation} vaultStats={vaultStats} fmtBytes={fmtBytes} onToggleInfo={toggleInfo} />
            <ProfileAddressSection fullId={fullId} copied={copied} onCopy={handleCopy} onShowQr={() => setShowQR(true)} onToggleInfo={toggleInfo} />
            <ProfileTechnicalSection identityId={identity?.upeerId} publicKey={identity?.publicKey} networkAddress={networkAddress} onToggleInfo={toggleInfo} />
            <ProfileQrModal open={showQR} fullId={fullId} copied={copied} onClose={() => setShowQR(false)} onCopy={handleCopy} />
            <ProfileInfoModal activeInfo={activeInfo} onClose={() => setActiveInfo(null)} />
        </Box>
    );
};
