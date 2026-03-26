import React, { useMemo, useEffect } from 'react';
import { Box } from '@mui/joy';
import { Group, Contact, ChatMessage } from '../../types/chat.js';
import { SidebarView, useNavigationStore } from '../../store/useNavigationStore.js';
import { useChatStore } from '../../store/useChatStore.js';
import { SubViewHeader } from './sidebar/SubViewHeader.js';
import { AddContactForm } from './sidebar/AddContactForm.js';
import { CreateGroupForm } from './sidebar/CreateGroupForm.js';
import { SidebarListPanel } from './sidebar/SidebarListPanel.js';
import { SidebarNewChatPanel } from './sidebar/SidebarNewChatPanel.js';

interface SidebarProps {
    contacts: Contact[];
    groups?: Group[];
    onSelectContact: (id: string) => void;
    onSelectGroup?: (groupId: string) => void;
    onToggleFavorite: (id: string) => void;
    onToggleFavoriteGroup: (groupId: string) => void;
    onClearChat: (id: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    selectedId?: string;
    selectedGroupId?: string;
    typingStatus?: Record<string, any>;
    onAddContact: (idAtAddress: string, name: string) => void;
    onCreateGroup?: (name: string, memberIds: string[], avatar?: string) => Promise<any>;
}

export const Sidebar: React.FC<SidebarProps> = ({
    contacts,
    groups = [],
    onSelectContact,
    onSelectGroup,
    onToggleFavorite,
    onToggleFavoriteGroup,
    onClearChat,
    onLeaveGroup,
    selectedId,
    selectedGroupId,
    onAddContact,
    typingStatus = {},
    onCreateGroup,
}) => {
    const {
        sidebarView,
        sidebarFilter,
        newChatSearch,
        sidebarSearch,
        setSidebarView,
        setSidebarFilter,
        setNewChatSearch,
        setSidebarSearch,
        setPendingScrollMsgId,
        openNewChat,
        backToList,
    } = useNavigationStore();

    const { handleSearchGlobal, searchResults } = useChatStore();

    useEffect(() => {
        const timer = setTimeout(() => {
            if (sidebarView === 'list') {
                handleSearchGlobal(sidebarSearch);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [sidebarSearch, sidebarView, handleSearchGlobal]);

    const mergedList = useMemo(() => {
        type Entry =
            | { kind: 'group'; data: Group; time: number }
            | { kind: 'contact'; data: Contact; time: number };

        const q = sidebarSearch.trim().toLowerCase();

        const entries: Entry[] = [
            ...groups
                .filter(g => sidebarFilter !== 'favorites' || !!g.isFavorite)
                .filter(g => !q || g.name.toLowerCase().includes(q))
                .map(g => ({
                    kind: 'group' as const,
                    data: g,
                    time: g.lastMessageTime ? new Date(g.lastMessageTime).getTime() : 0,
                })),
            ...contacts
                .filter(c => c.status !== 'blocked')
                .filter(c => sidebarFilter !== 'favorites' || !!c.isFavorite)
                .filter(c => !q || c.name?.toLowerCase().includes(q) || c.upeerId?.toLowerCase().includes(q))
                .map(c => ({
                    kind: 'contact' as const,
                    data: c,
                    time: c.lastMessageTime ? new Date(c.lastMessageTime).getTime() : 0,
                })),
        ];
        return entries.sort((a, b) => b.time - a.time);
    }, [groups, contacts, sidebarFilter, sidebarSearch]);

    const filteredGroups = useMemo(() => {
        if (sidebarFilter === 'unread' || sidebarFilter === 'favorites') return [];
        const q = sidebarSearch.trim().toLowerCase();
        return groups.filter(g => !q || g.name.toLowerCase().includes(q));
    }, [groups, sidebarFilter, sidebarSearch]);

    const searchedContacts = useMemo(() => {
        const q = newChatSearch.trim().toLowerCase();
        if (!q) return contacts.filter(c => c.status !== 'blocked' && !c.isConversationOnly);
        return contacts.filter(c =>
            c.status !== 'blocked' &&
            !c.isConversationOnly &&
            (c.name?.toLowerCase().includes(q) ||
                c.upeerId?.toLowerCase().includes(q))
        );
    }, [contacts, newChatSearch]);

    const handleSelectMessage = (msg: ChatMessage) => {
        if (msg.id) setPendingScrollMsgId(msg.id);
        if (msg.groupId) {
            onSelectGroup?.(msg.groupId);
        } else {
            onSelectContact(msg.upeerId);
        }
    };

    const handleOpenNew = () => openNewChat();
    const handleBack = () => backToList();
    const handleSelectExisting = (id: string) => { onSelectContact(id); backToList(); };

    const offset = (v: SidebarView): string => {
        if (sidebarView === v) return 'translateX(0)';
        const orderMap: Record<SidebarView, number> = { list: 0, new: 1, 'add-contact': 2, 'create-group': 2 };
        return orderMap[sidebarView] > orderMap[v] ? 'translateX(-100%)' : 'translateX(100%)';
    };

    const panelSx = (v: SidebarView) => {
        const isActive = sidebarView === v;
        return {
            position: 'absolute' as const,
            inset: 0,
            display: 'flex',
            flexDirection: 'column' as const,
            backgroundColor: 'background.surface',
            transform: offset(v),
            transition: isActive
                ? 'transform 0.22s cubic-bezier(0.4,0,0.2,1), visibility 0s 0s'
                : 'transform 0.22s cubic-bezier(0.4,0,0.2,1), visibility 0s 0.22s',
            visibility: isActive ? 'visible' as const : 'hidden' as const,
            pointerEvents: isActive ? 'auto' as const : 'none' as const,
            zIndex: isActive ? 1 : 0,
            overflow: 'hidden',
        };
    };

    return (
        <Box sx={{
            position: 'relative',
            width: 400, minWidth: 400, flexShrink: 0,
            borderRight: '1px solid', borderColor: 'divider',
            backgroundColor: 'background.surface',
            overflow: 'hidden',
            height: '100%',
        }}>
            <Box sx={panelSx('list')}>
                <SidebarListPanel
                    groups={groups}
                    contacts={contacts}
                    mergedList={mergedList}
                    filteredGroups={filteredGroups}
                    sidebarSearch={sidebarSearch}
                    sidebarFilter={sidebarFilter}
                    selectedId={selectedId}
                    selectedGroupId={selectedGroupId}
                    searchResults={searchResults}
                    typingStatus={typingStatus}
                    onSelectContact={onSelectContact}
                    onSelectGroup={onSelectGroup}
                    onToggleFavorite={onToggleFavorite}
                    onToggleFavoriteGroup={onToggleFavoriteGroup}
                    onClearChat={onClearChat}
                    onLeaveGroup={onLeaveGroup}
                    onOpenNew={handleOpenNew}
                    onFilterChange={setSidebarFilter}
                    onSearchChange={setSidebarSearch}
                    onSelectMessage={handleSelectMessage}
                    onOpenCreateGroup={onCreateGroup ? () => setSidebarView('create-group') : undefined}
                />
            </Box>

            <Box sx={panelSx('new')}>
                <SidebarNewChatPanel
                    sidebarView={sidebarView}
                    newChatSearch={newChatSearch}
                    searchedContacts={searchedContacts}
                    onBack={handleBack}
                    onSearchChange={setNewChatSearch}
                    onOpenAddContact={() => setSidebarView('add-contact')}
                    onOpenCreateGroup={onCreateGroup ? () => setSidebarView('create-group') : undefined}
                    onSelectExisting={handleSelectExisting}
                />
            </Box>

            <Box sx={panelSx('add-contact')}>
                <SubViewHeader title="Añadir contacto" onBack={() => setSidebarView('new')} />
                <AddContactForm
                    onAdd={onAddContact}
                    onDone={() => setSidebarView('list')}
                />
            </Box>

            <Box sx={panelSx('create-group')}>
                <SubViewHeader title="Nuevo grupo" onBack={() => setSidebarView(sidebarView === 'create-group' && sidebarFilter === 'groups' ? 'list' : 'new')} />
                {onCreateGroup && (
                    <CreateGroupForm
                        contacts={contacts}
                        onCreate={onCreateGroup}
                        onDone={() => setSidebarView('list')}
                    />
                )}
            </Box>
        </Box>
    );
};