import React, { useEffect, useState } from 'react';
import { Box } from '@mui/joy';

import { Contact, ChatMessage } from '../../types/chat.js';
import type { FileTransfer } from '../../hooks/fileTransferTypes.js';
import { getTrustMeta, formatSeen } from './contactInfoHelpers.js';
import { ContactMediaExplorer } from './ContactMediaExplorer.js';
import { ContactInfoCipherView } from './ContactInfoCipherView.js';
import { ContactInfoDeleteDialog } from './ContactInfoDeleteDialog.js';
import { ContactInfoPanelMainView } from './ContactInfoPanelMainView.js';
import { buildContactInfoActions, SlidingPanelView, usePanelView, useSharedMediaItems, type ContactPanelView } from './contactInfoPanelSupport.js';
import { ChatSearchView } from '../../features/chat/ChatSearchView.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { usePrivacyStore } from '../../store/usePrivacyStore.js';
import { visiblePresence } from '../../utils/presenceVisibility.js';

interface MediaClickPayload {
    url: string;
    name: string;
    mimeType: string;
    fileId: string;
}

interface ContactInfoPanelProps {
    contact: Contact;
    chatHistory: ChatMessage[];
    activeTransfers: FileTransfer[];
    onClose: () => void;
    onShare: () => void;
    onShowSecurity?: () => void;
    onClearChat: () => void;
    onBlockContact: () => void;
    onDeleteContact: () => void;
    onOpenMedia: (media: MediaClickPayload) => void;
    onArchive?: () => void;
    onMute?: () => void;
    onFavorite?: () => void;
    onCallAudio?: () => void;
    onCallVideo?: () => void;
    callsUnavailable?: boolean;
    view?: ContactPanelView;
    onViewChange?: (view: ContactPanelView) => void;
}

export const ContactInfoPanel: React.FC<ContactInfoPanelProps> = ({
    contact,
    chatHistory,
    activeTransfers,
    onClose,
    onShare,
    onShowSecurity,
    onClearChat,
    onBlockContact,
    onDeleteContact,
    onOpenMedia,
    onArchive,
    onMute,
    onFavorite,
    onCallAudio,
    onCallVideo,
    callsUnavailable,
    view,
    onViewChange,
}) => {
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [currentView, setCurrentView] = usePanelView<ContactPanelView>(view, onViewChange, 'main');
    const [now, setNow] = useState(() => Date.now());
    const toggleContact = useChatActionsStore((state) => state.toggleContact);
    const archiveFallback = () => toggleContact(contact.upeerId, 'archived');
    const muteFallback = () => toggleContact(contact.upeerId, 'muted');
    const favoriteFallback = () => toggleContact(contact.upeerId, 'pinned');
    const effectiveArchive = onArchive ?? archiveFallback;
    const effectiveMute = onMute ?? muteFallback;
    const effectiveFavorite = onFavorite ?? favoriteFallback;

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    const onlineStatusPref = usePrivacyStore((s) => s.onlineStatus);
    const lastSeenPref = usePrivacyStore((s) => s.lastSeen);
    const presence = visiblePresence(!!contact.lastActive && (now - new Date(contact.lastActive).getTime()) < 65000, formatSeen(contact.lastSeen), {
        onlineStatus: onlineStatusPref,
        lastSeen: lastSeenPref,
    });
    const isOnline = presence.isOnline;
    const lastSeenText = presence.lastSeen;
    const trust = getTrustMeta(contact.vouchScore);
    const sharedMedia = useSharedMediaItems(chatHistory, activeTransfers);
    const { utilityActions, dangerActions } = buildContactInfoActions({
        contact,
        onShare,
        onArchive: effectiveArchive,
        onMute: effectiveMute,
        onFavorite: effectiveFavorite,
        onClearChat,
        onBlockContact,
        onDeleteRequest: () => setConfirmDeleteOpen(true),
    });

    return (
        <>
            <Box sx={{
                width: 480,
                minWidth: 380,
                maxWidth: 480,
                flexShrink: 0,
                borderLeft: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.surface',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
            }}>
                <SlidingPanelView active={currentView === 'main'} direction="left">
                    <ContactInfoPanelMainView
                        contact={contact}
                        isOnline={isOnline}
                        lastSeenText={lastSeenText}
                        trust={trust}
                        sharedMedia={sharedMedia}
                        utilityActions={utilityActions}
                        dangerActions={dangerActions}
                        onClose={onClose}
                        onOpenMedia={onOpenMedia}
                        onViewAllMedia={() => setCurrentView('media')}
                        onOpenCipher={() => setCurrentView('cipher')}
                        onCallAudio={onCallAudio ?? (() => undefined)}
                        onCallVideo={onCallVideo ?? (() => undefined)}
                        onOpenSearch={() => setCurrentView('search')}
                        callsUnavailable={callsUnavailable ?? false}
                    />
                </SlidingPanelView>

                <SlidingPanelView active={currentView === 'media'} direction="right" zIndex={10} backgroundColor="background.surface">
                    <ContactMediaExplorer items={sharedMedia} onBack={() => setCurrentView('main')} onOpenMedia={onOpenMedia} />
                </SlidingPanelView>

                <SlidingPanelView active={currentView === 'search'} direction="right" zIndex={10} backgroundColor="background.surface">
                    <ChatSearchView conversationKey={contact.upeerId} onBack={() => setCurrentView('main')} />
                </SlidingPanelView>

                <SlidingPanelView active={currentView === 'cipher'} direction="right">
                    <ContactInfoCipherView
                        contactName={contact.name}
                        upeerId={contact.upeerId}
                        onBack={() => setCurrentView('main')}
                        onShowSecurity={onShowSecurity}
                    />
                </SlidingPanelView>
            </Box>

            <ContactInfoDeleteDialog
                open={confirmDeleteOpen}
                contactName={contact.name}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={() => {
                    onDeleteContact();
                    setConfirmDeleteOpen(false);
                }}
            />
        </>
    );
};
