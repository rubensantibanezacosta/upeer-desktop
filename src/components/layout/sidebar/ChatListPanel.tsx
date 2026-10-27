import React, { useLayoutEffect, useRef } from 'react';
import { Box, List } from '@mui/joy';
import { SidebarHeader } from '../SidebarHeader.js';
import { SidebarSearch } from '../SidebarSearch.js';
import { ContactItem } from '../ContactItem.js';
import { GroupItem } from '../GroupItem.js';
import { SearchResultsPanel } from './SearchResultsPanel.js';
import { activateSearchRow, closestSearchRow, moveSearchFocus } from './searchKeyboard.js';
import { SidebarEmptyStateView, resolveSidebarEmptyState } from './sidebarEmptyState.js';
import { visibleSearchSections } from '../../../features/search/globalSearch.js';
import type { ChatSearchItem, SearchSection } from '../../../features/search/globalSearch.js';
import type { SearchSectionLoading } from '../../../store/chatStoreTypes.js';
import type { SidebarFilter } from '../../../store/useNavigationStore.js';
import type { ChatMessage } from '../../../types/chat.js';

interface ChatListPanelProps {
    entries: ChatSearchItem[];
    sidebarSearch: string;
    sidebarFilter: SidebarFilter;
    selectedId?: string;
    selectedGroupId?: string;
    searchSections: SearchSection[];
    searchLoading: SearchSectionLoading;
    typingStatus: Record<string, NodeJS.Timeout>;
    loading?: boolean;
    onSelectContact: (id: string) => void;
    onSelectGroup?: (groupId: string) => void;
    onToggleFavorite: (id: string) => void;
    onToggleFavoriteGroup: (groupId: string) => void;
    onClearChat: (id: string) => void;
    onClearGroupChat?: (groupId: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    onOpenNew: () => void;
    onFilterChange: (filter: SidebarFilter) => void;
    onSearchChange: (value: string) => void;
    onSelectMessage: (msg: ChatMessage) => void;
    onShowAllContacts: () => void;
    onLoadMoreMessages: () => void;
    onOpenCreateGroup?: () => void;
    onOpenAppLock?: () => void;
    searchFocusToken?: number;
}

export const ChatListPanel: React.FC<ChatListPanelProps> = ({
    entries,
    sidebarSearch,
    sidebarFilter,
    selectedId,
    selectedGroupId,
    searchSections,
    searchLoading,
    typingStatus,
    loading = false,
    onSelectContact,
    onSelectGroup,
    onToggleFavorite,
    onToggleFavoriteGroup,
    onClearChat,
    onClearGroupChat,
    onLeaveGroup,
    onOpenNew,
    onFilterChange,
    onSearchChange,
    onSelectMessage,
    onShowAllContacts,
    onLoadMoreMessages,
    onOpenCreateGroup,
    onOpenAppLock,
    searchFocusToken,
}) => {
    const term = sidebarSearch.trim();
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const savedScroll = useRef(0);

    useLayoutEffect(() => {
        if (term) return;
        const container = scrollRef.current;
        if (container) container.scrollTop = savedScroll.current;
    }, [term]);

    const handleListScroll = () => {
        if (term) return;
        savedScroll.current = scrollRef.current?.scrollTop ?? 0;
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            if (moveSearchFocus(scrollRef.current, 1)) event.preventDefault();
            return;
        }
        if (event.key === 'Escape' && sidebarSearch) {
            event.preventDefault();
            onSearchChange('');
        }
    };

    const handleResultsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const row = closestSearchRow(event.target);
        if (!row) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveSearchFocus(scrollRef.current, event.key === 'ArrowDown' ? 1 : -1, row);
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateSearchRow(row);
        }
    };

    const sections = term ? visibleSearchSections(searchSections) : [];
    const searchPending = searchLoading.chats || searchLoading.contacts || searchLoading.groups || searchLoading.messages;
    const visibleCount = term
        ? sections.reduce((total, section) => total + section.items.length, 0)
        : entries.length;

    const emptyState = resolveSidebarEmptyState({
        filter: sidebarFilter,
        loading: loading || searchPending,
        search: sidebarSearch,
        visibleCount,
        sourceCount: entries.length,
        onOpenNew,
        onCreateGroup: onOpenCreateGroup,
        onShowAll: () => onFilterChange('all'),
        onClearSearch: () => onSearchChange(''),
    });

    return (
        <>
            <SidebarHeader onAddNew={onOpenNew} onCreateGroup={onOpenCreateGroup} onOpenAppLock={onOpenAppLock} />
            <SidebarSearch
                value={sidebarSearch}
                onChange={onSearchChange}
                onKeyDown={handleSearchKeyDown}
                activeFilter={sidebarFilter}
                onFilterChange={(filter) => onFilterChange(filter as SidebarFilter)}
                autoFocus={searchFocusToken !== undefined && searchFocusToken > 0}
                focusKey={searchFocusToken ? `search-${searchFocusToken}` : undefined}
            />
            <Box
                ref={scrollRef}
                onScroll={handleListScroll}
                onKeyDown={term ? handleResultsKeyDown : undefined}
                data-testid="chat-list-scroll"
                sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
                {emptyState ? (
                    <SidebarEmptyStateView model={emptyState} />
                ) : term ? (
                    <SearchResultsPanel
                        sections={sections}
                        query={sidebarSearch}
                        selectedId={selectedId}
                        selectedGroupId={selectedGroupId}
                        typingStatus={typingStatus}
                        messagesLoading={searchLoading.messages}
                        onSelectContact={onSelectContact}
                        onSelectGroup={onSelectGroup}
                        onToggleFavorite={onToggleFavorite}
                        onToggleFavoriteGroup={onToggleFavoriteGroup}
                        onClearChat={onClearChat}
                        onClearGroupChat={onClearGroupChat}
                        onLeaveGroup={onLeaveGroup}
                        onSelectMessage={onSelectMessage}
                        onShowAllContacts={onShowAllContacts}
                        onLoadMoreMessages={onLoadMoreMessages}
                    />
                ) : (
                    <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                        {entries.map((entry) => (entry.kind === 'group'
                            ? (
                                <GroupItem
                                    key={entry.group.groupId}
                                    group={entry.group}
                                    isSelected={selectedGroupId === entry.group.groupId}
                                    onSelect={onSelectGroup || (() => undefined)}
                                    onToggleFavorite={onToggleFavoriteGroup}
                                    onLeaveGroup={onLeaveGroup}
                                    onClearChat={onClearGroupChat}
                                />
                            )
                            : (
                                <ContactItem
                                    key={entry.contact.upeerId}
                                    contact={entry.contact}
                                    isSelected={selectedId === entry.contact.upeerId}
                                    onSelect={onSelectContact}
                                    onToggleFavorite={onToggleFavorite}
                                    onClear={onClearChat}
                                    isTyping={!!typingStatus[entry.contact.upeerId]}
                                />
                            )))}
                    </List>
                )}
            </Box>
        </>
    );
};
