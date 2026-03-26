import React, { useEffect, useState } from 'react';
import { Box } from '@mui/joy';

import { Contact, ChatMessage } from '../../types/chat.js';
import { getTrustMeta, formatSeen } from './contactInfoHelpers.js';
import { ContactMediaExplorer } from './ContactMediaExplorer.js';
import { ContactInfoCipherView } from './ContactInfoCipherView.js';
import { ContactInfoDeleteDialog } from './ContactInfoDeleteDialog.js';
import { ContactInfoPanelMainView } from './ContactInfoPanelMainView.js';
import { buildContactInfoActions, SlidingPanelView, useSharedMediaItems } from './contactInfoPanelSupport.js';

interface ContactInfoPanelProps {
    contact: Contact;
    chatHistory: ChatMessage[];
    activeTransfers: any[];
    onClose: () => void;
    onShare: () => void;
    onShowSecurity?: () => void;
    onClearChat: () => void;
    onBlockContact: () => void;
    onDeleteContact: () => void;
    onOpenMedia: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    onArchive?: () => void;
    onMute?: () => void;
    onFavorite?: () => void;
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
}) => {
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'main' | 'media' | 'cipher'>('main');
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    const isOnline = !!contact.lastSeen && (now - new Date(contact.lastSeen).getTime()) < 65000;
    const lastSeenText = formatSeen(contact.lastSeen);
    const trust = getTrustMeta((contact as any).vouchScore);
    const sharedMedia = useSharedMediaItems(chatHistory, activeTransfers);
    const { utilityActions, dangerActions } = buildContactInfoActions({
        contact,
        onShare,
        onArchive,
        onMute,
        onFavorite,
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
                    />
                </SlidingPanelView>

                <SlidingPanelView active={currentView === 'media'} direction="right" zIndex={10} backgroundColor="background.surface">
                    <ContactMediaExplorer items={sharedMedia} onBack={() => setCurrentView('main')} onOpenMedia={onOpenMedia} />
                </SlidingPanelView>

                <SlidingPanelView active={currentView === 'cipher'} direction="right">
                    <ContactInfoCipherView
                        contactName={contact.name}
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
