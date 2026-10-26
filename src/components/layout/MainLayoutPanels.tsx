import React from 'react';
import { Box } from '@mui/joy';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { CallsPanel } from '../../features/call/CallsPanel.js';
import type { MainLayoutProps } from './MainLayout.js';

interface MainLayoutPanelsProps {
    navigation: MainLayoutProps['navigation'];
    appStore: MainLayoutProps['appStore'];
    chatStore: MainLayoutProps['chatStore'];
    onLockSession: () => void;
}

export const MainLayoutPanels: React.FC<MainLayoutPanelsProps> = ({ navigation, appStore, chatStore, onLockSession }) => {
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

    if (navigation.appView === 'calls') {
        return (
            <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                <CallsPanel contacts={chatStore.contacts} groups={chatStore.groups} selfUpeerId={chatStore.myIdentity?.upeerId} />
            </Box>
        );
    }

    return null;
};