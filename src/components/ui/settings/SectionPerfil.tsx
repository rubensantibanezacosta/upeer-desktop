import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleUser } from 'lucide-react';
import type { Identity } from './types.js';
import { resizeImageToDataUrl } from './shared.js';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import {
    type InfoKey,
    ProfileAddressSection,
    ProfileHeroSection,
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
    const [activeInfo, setActiveInfo] = useState<InfoKey | null>(null);
    const [showQR, setShowQR] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleInfo = (key: InfoKey) =>
        setActiveInfo(prev => prev === key ? null : key);

    const addr = identity?.address || networkAddress || '';
    const fullId = identity ? `${identity.upeerId}@${addr}` : '';
    const displayName = alias || identity?.upeerId || 'Mi cuenta';

    const handleCopy = useCallback(async () => {
        try {
            const result = await window.upeer.writeClipboardText(fullId);
            if (!result.success) throw new Error(result.error || 'Motivo no disponible');
            setCopied(true);
            setCopyError('');
            setTimeout(() => setCopied(false), 2000);
        } catch (cause) {
            setCopied(false);
            setCopyError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [fullId]);

    useEffect(() => {
        if (identity?.alias != null) setAlias(identity.alias);
        if (identity?.avatar != null) setAvatar(identity.avatar);
    }, [identity?.alias, identity?.avatar]);

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

    return (
        <SettingsSection
            icon={<CircleUser style={{ fontSize: 18 }} />}
            title="Perfil"
            description="Así te ven tus contactos: nombre, foto y la dirección con la que pueden escribirte."
        >
            <SettingsCard>
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
            </SettingsCard>
            <SettingsCard>
                <ProfileAddressSection fullId={fullId} copied={copied} copyError={copyError} onCopy={handleCopy} onShowQr={() => setShowQR(true)} onToggleInfo={toggleInfo} />
            </SettingsCard>
            <SettingsCard>
                <ProfileTechnicalSection identityId={identity?.upeerId} publicKey={identity?.publicKey} networkAddress={networkAddress} onToggleInfo={toggleInfo} />
            </SettingsCard>
            <ProfileQrModal open={showQR} fullId={fullId} copied={copied} copyError={copyError} onClose={() => setShowQR(false)} onCopy={handleCopy} />
            <ProfileInfoModal activeInfo={activeInfo} onClose={() => setActiveInfo(null)} />
        </SettingsSection>
    );
};
