import React from 'react';
import { Box } from '@mui/joy';
import { ContactsPanel } from './ContactsPanel.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { CallsPanel } from '../../features/call/CallsPanel.js';
import type { MainLayoutProps } from './MainLayout.js';
import type { CallKind } from '../../features/call/useCall.js';

interface MainLayoutPanelsProps {
    navigation: MainLayoutProps['navigation'];
    appStore: MainLayoutProps['appStore'];
    chatStore: MainLayoutProps['chatStore'];
    onLockSession: () => void;
    onStartCall: (peerUpeerId: string, kind: CallKind, isGroup?: boolean, groupMembers?: string[]) => Promise<unknown>;
    onToggleMute: (callId?: string) => Promise<void>;
    onToggleCamera: (callId?: string) => Promise<void>;
    onEndCall: (callId?: string) => Promise<void>;
}

export const MainLayoutPanels: React.FC<MainLayoutPanelsProps> = ({ navigation, appStore, chatStore, onLockSession, onStartCall, onToggleMute, onToggleCamera, onEndCall }) => {
    if (navigation.appView === 'settings') {
        return (
            <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                <SettingsPanel
                    identity={chatStore.myIdentity}
                    networkAddress={chatStore.networkAddress}
                    networkStatus={appStore.networkStatus}
                    activeSection={navigation.settingsSection}
                    onSectionChange={navigation.setSettingsSection}
                    onIdentityUpdate={chatStore.refreshData}
                    onLockSession={onLockSession}
                />
            </Box>
        );
    }

    if (navigation.appView === 'contacts') {
        return (
            <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                <ContactsPanel
                    contacts={chatStore.contacts}
                    groups={chatStore.groups}
                    selectedContactId={chatStore.targetUpeerId}
                    onSelectContact={chatStore.setTargetUpeerId}
                    onOpenChat={(upeerId) => {
                        chatStore.setTargetUpeerId(upeerId);
                        navigation.goToChat();
                    }}
                    onDeleteContact={chatStore.handleDeleteContact}
                    onBlockContact={(upeerId) => chatStore.handleBlockContact(upeerId)}
                    onUnblockContact={chatStore.handleUnblockContact}
                />
            </Box>
        );
    }

    if (navigation.appView === 'calls') {
        return (
            <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                <CallsPanel contacts={chatStore.contacts} groups={chatStore.groups} selfUpeerId={chatStore.myIdentity?.upeerId} onStartCall={onStartCall} onToggleMute={onToggleMute} onToggleCamera={onToggleCamera} onEndCall={onEndCall} />
            </Box>
        );
    }

    return null;
};