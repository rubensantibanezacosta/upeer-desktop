import React, { useMemo, useEffect } from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import { Group, Contact, ChatMessage } from '../../types/chat.js';
import { SidebarView, useNavigationStore } from '../../store/useNavigationStore.js';
import { useChatStore } from '../../store/useChatStore.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { chatChipTarget, matchesChip, type ChatSearchItem } from '../../features/search/globalSearch.js';
import { buildSearchEntities } from '../../features/search/searchData.js';
import { SubViewHeader } from './sidebar/SubViewHeader.js';
import { AddContactForm } from './sidebar/AddContactForm.js';
import { CreateGroupForm } from './sidebar/CreateGroupForm.js';
import { X } from 'lucide-react';
import { ChatListPanel } from './sidebar/ChatListPanel.js';
import { GlobalStarredView } from '../../features/chat/GlobalStarredView.js';
import { ListsPanel } from './sidebar/ListsPanel.js';
import { useChatListsStore } from '../../store/useChatListsStore.js';
import { findChatList } from '../../utils/chatLists.js';
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
    typingStatus?: Record<string, NodeJS.Timeout>;
    onAddContact: (idAtAddress: string, name: string) => void;
    onCreateGroup?: (name: string, memberIds: string[], avatar?: string) => Promise<{ success: boolean; groupId: string }>;
    onOpenAppLock?: () => void;
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
    onOpenAppLock,
}) => {
    const {
        sidebarView,
        sidebarFilter,
        newChatSearch,
        sidebarSearch,
        sidebarSearchFocusToken,
        setSidebarView,
        setSidebarFilter,
        setNewChatSearch,
        setSidebarSearch,
        setPendingScrollMsgId,
        openNewChat,
        backToList,
        activeListId,
        setActiveListId,
    } = useNavigationStore();

    const { handleSearchGlobal, searchSections, searchLoading, isHydrating, loadMoreSearchMessages, showAllSearchContacts } = useChatStore();

    useEffect(() => {
        const timer = setTimeout(() => {
            if (sidebarView === 'list') {
                handleSearchGlobal(sidebarSearch, sidebarFilter);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [sidebarSearch, sidebarFilter, contacts, groups, sidebarView, handleSearchGlobal]);

    const contactPrefs = useChatActionsStore((state) => state.contactPrefs);
    const groupPrefs = useChatActionsStore((state) => state.groupPrefs);
    const chatLists = useChatListsStore((state) => state.lists);
    const activeList = findChatList(chatLists, activeListId);

    const chatEntries = useMemo<ChatSearchItem[]>(() => {
        const entities = buildSearchEntities(contacts, groups, { contactPrefs, groupPrefs });
        return entities.chats
            .filter((entry) => matchesChip(sidebarFilter, chatChipTarget(entry)))
            .filter((entry) => {
                if (!activeList) return true;
                const chatId = entry.kind === 'group' && entry.group ? entry.group.groupId : entry.contact?.upeerId;
                return !!chatId && activeList.chatIds.includes(chatId);
            })
            .sort((left, right) => Number(right.state.pinned) - Number(left.state.pinned) || right.time - left.time)
            .map((entry) => (entry.kind === 'group' && entry.group
                ? { kind: 'group', group: entry.group, time: entry.time }
                : { kind: 'contact', contact: entry.contact as Contact, time: entry.time }));
    }, [contacts, groups, sidebarFilter, contactPrefs, groupPrefs, activeList]);

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
    const openStarredChat = (chatId: string) => {
        if (chatId.startsWith('grp-')) {
            onSelectGroup?.(chatId);
        } else {
            onSelectContact(chatId);
        }
        backToList();
    };
    const handleSelectExisting = (id: string) => { onSelectContact(id); backToList(); };

    const offset = (v: SidebarView): string => {
        if (sidebarView === v) return 'translateX(0)';
        const orderMap: Record<SidebarView, number> = { list: 0, new: 1, 'add-contact': 2, 'create-group': 2, starred: 1, lists: 1 };
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
            overflow: 'clip',
            height: '100%',
        }}>
            <Box sx={panelSx('list')}>
                {activeList && (
                    <Box
                        data-active-list={activeList.id}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, backgroundColor: 'background.level1' }}
                    >
                        <Typography level="body-xs" sx={{ flexGrow: 1, color: 'text.secondary' }}>
                            Lista «{activeList.name}» · {activeList.chatIds.length === 1 ? '1 chat' : `${activeList.chatIds.length} chats`}
                        </Typography>
                        <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            aria-label="Quitar el filtro de la lista"
                            onClick={() => setActiveListId(null)}
                        >
                            <X style={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>
                )}
                <ChatListPanel
                    entries={chatEntries}
                    sidebarSearch={sidebarSearch}
                    sidebarFilter={sidebarFilter}
                    selectedId={selectedId}
                    selectedGroupId={selectedGroupId}
                    searchSections={searchSections}
                    searchLoading={searchLoading}
                    typingStatus={typingStatus}
                    onSelectContact={onSelectContact}
                    onSelectGroup={onSelectGroup}
                    onToggleFavorite={onToggleFavorite}
                    onToggleFavoriteGroup={onToggleFavoriteGroup}
                    onClearChat={onClearChat}
                    onClearGroupChat={(groupId) => void onClearChat(groupId)}
                    onLeaveGroup={onLeaveGroup}
                    onOpenNew={handleOpenNew}
                    onFilterChange={setSidebarFilter}
                    onSearchChange={setSidebarSearch}
                    onSelectMessage={handleSelectMessage}
                    onShowAllContacts={showAllSearchContacts}
                    onLoadMoreMessages={() => void loadMoreSearchMessages()}
                    onOpenCreateGroup={onCreateGroup ? () => setSidebarView('create-group') : undefined}
                    onOpenAppLock={onOpenAppLock}
                    onOpenStarred={() => setSidebarView('starred')}
                    onOpenLists={() => setSidebarView('lists')}
                    searchFocusToken={sidebarSearchFocusToken}
                    loading={isHydrating}
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

            <Box sx={panelSx('lists')}>
                {sidebarView === 'lists' && (
                    <ListsPanel
                        chats={[
                            ...contacts.filter((contact) => contact.status !== 'blocked').map((contact) => ({ id: contact.upeerId, name: contact.name })),
                            ...groups.map((group) => ({ id: group.groupId, name: group.name })),
                        ]}
                        onApply={(listId) => { setActiveListId(listId); setSidebarView('list'); }}
                        onBack={handleBack}
                    />
                )}
            </Box>

            <Box sx={panelSx('starred')}>
                {sidebarView === 'starred' && (
                    <GlobalStarredView
                        contacts={contacts.map((contact) => ({ id: contact.upeerId, name: contact.name }))}
                        groups={groups.map((group) => ({ id: group.groupId, name: group.name }))}
                        onOpenChat={openStarredChat}
                        onBack={handleBack}
                    />
                )}
            </Box>
        </Box>
    );
};