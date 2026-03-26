import React from 'react';
import { Box } from '@mui/joy';
import { ContactsPanel } from './ContactsPanel.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';

interface MainLayoutPanelsProps {
    navigation: any;
    appStore: any;
    chatStore: any;
    onLockSession: () => void;
}

export const MainLayoutPanels: React.FC<MainLayoutPanelsProps> = ({ navigation, appStore, chatStore, onLockSession }) => {
    if (navigation.appView === 'settings') {
        return (
            <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                <SettingsPanel
                    identity={chatStore.myIdentity}
                    networkAddress={appStore.networkAddress}
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

    return null;
};