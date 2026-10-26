import React from 'react';
import { Avatar, Box, List, ListItem, ListItemContent, ListItemDecorator, Typography } from '@mui/joy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { SidebarHeader } from '../SidebarHeader.js';
import { SidebarSearch } from '../SidebarSearch.js';
import { ContactItem } from '../ContactItem.js';
import { GroupItem } from '../GroupItem.js';
import { highlightText } from '../../../utils/highlightText.js';
import { resolveSidebarEmptyState, SidebarEmptyStateView } from './sidebarEmptyState.js';
import type { ChatMessage, Contact, Group } from '../../../types/chat.js';
import type { SidebarFilter } from '../../../store/useNavigationStore.js';

type SearchResultMessage = ChatMessage & {
    senderDisplayName?: string;
};

interface SidebarListPanelProps {
    groups: Group[];
    contacts: Contact[];
    mergedList: Array<{ kind: 'group'; data: Group; time: number } | { kind: 'contact'; data: Contact; time: number }>;
    filteredGroups: Group[];
    sidebarSearch: string;
    sidebarFilter: SidebarFilter;
    selectedId?: string;
    selectedGroupId?: string;
    searchResults: SearchResultMessage[];
    typingStatus: Record<string, NodeJS.Timeout>;
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
    onOpenCreateGroup?: () => void;
    searchFocusToken?: number;
    loading?: boolean;
}

export const SidebarListPanel: React.FC<SidebarListPanelProps> = ({
    groups,
    contacts,
    mergedList,
    filteredGroups,
    sidebarSearch,
    sidebarFilter,
    selectedId,
    selectedGroupId,
    searchResults,
    typingStatus,
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
    onOpenCreateGroup,
    searchFocusToken,
    loading = false,
}) => {
    const term = sidebarSearch.trim();
    const visibleCount = sidebarFilter === 'groups'
        ? filteredGroups.length
        : mergedList.length + (sidebarFilter === 'all' && term ? searchResults.length : 0);
    const sourceCount = sidebarFilter === 'groups'
        ? groups.length
        : sidebarFilter === 'favorites'
            ? groups.filter((group) => group.isFavorite).length + contacts.filter((contact) => contact.status !== 'blocked' && contact.isFavorite).length
            : groups.length + contacts.filter((contact) => contact.status !== 'blocked').length;

    const emptyState = resolveSidebarEmptyState({
        filter: sidebarFilter,
        loading,
        search: sidebarSearch,
        visibleCount,
        sourceCount,
        onOpenNew,
        onCreateGroup: onOpenCreateGroup,
        onShowAll: () => onFilterChange('all'),
        onClearSearch: () => onSearchChange(''),
    });

    const sectionLabel = (label: string, spacing: Record<string, number>) => (
        <Box sx={{ px: 2, pb: 0.5, ...spacing }}>
            <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                {label}
            </Typography>
        </Box>
    );

    return (
        <>
            <SidebarHeader onAddNew={onOpenNew} onCreateGroup={onOpenCreateGroup} />
            <SidebarSearch value={sidebarSearch} onChange={onSearchChange} activeFilter={sidebarFilter} onFilterChange={(filter) => onFilterChange(filter as SidebarFilter)} autoFocus={searchFocusToken !== undefined && searchFocusToken > 0} focusKey={searchFocusToken ? `search-${searchFocusToken}` : undefined} />
            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {emptyState ? (
                    <SidebarEmptyStateView model={emptyState} />
                ) : (
                    <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                        {sidebarFilter === 'groups'
                            ? filteredGroups.map((group) => (
                                <GroupItem key={group.groupId} group={group} isSelected={selectedGroupId === group.groupId} onSelect={onSelectGroup || (() => undefined)} onToggleFavorite={onToggleFavoriteGroup} onLeaveGroup={onLeaveGroup} onClearChat={onClearGroupChat} highlight={sidebarSearch} />
                            ))
                            : (
                                <>
                                    {term.length > 0 && mergedList.length > 0 && sectionLabel('Chats', { pt: 2 })}
                                    {mergedList.map((entry) =>
                                        entry.kind === 'group'
                                            ? <GroupItem key={entry.data.groupId} group={entry.data} isSelected={selectedGroupId === entry.data.groupId} onSelect={onSelectGroup || (() => undefined)} onToggleFavorite={onToggleFavoriteGroup} onLeaveGroup={onLeaveGroup} onClearChat={onClearGroupChat} highlight={sidebarSearch} />
                                            : <ContactItem key={entry.data.upeerId} contact={entry.data} isSelected={selectedId === entry.data.upeerId} onSelect={onSelectContact} onToggleFavorite={onToggleFavorite} onClear={onClearChat} isTyping={!!typingStatus[entry.data.upeerId]} highlight={sidebarSearch} />,
                                    )}
                                    {sidebarFilter === 'all' && term.length > 0 && searchResults.length > 0 && (
                                        <>
                                            {sectionLabel('Mensajes', { pt: 3 })}
                                            {searchResults.map((msg) => (
                                                <ListItem
                                                    key={msg.id}
                                                    onClick={() => onSelectMessage(msg)}
                                                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'background.level1' }, px: 2, py: 1.5 }}
                                                >
                                                    <ListItemDecorator sx={{ mr: 1.5 }}>
                                                        <Avatar size="sm" src={msg.senderAvatar || undefined}>
                                                            {!msg.senderAvatar && <ChatBubbleOutlineIcon />}
                                                        </Avatar>
                                                    </ListItemDecorator>
                                                    <ListItemContent>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                                            <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                                                                {msg.senderName || msg.senderDisplayName || 'Mensaje'}
                                                            </Typography>
                                                            <Typography level="body-xs" sx={{ opacity: 0.6 }}>
                                                                {msg.timestamp}
                                                            </Typography>
                                                        </Box>
                                                        <Typography level="body-xs" sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal', overflow: 'hidden' }}>
                                                            {msg.senderDisplayName && (
                                                                <Box component="span" sx={{ fontWeight: 600, mr: 0.5 }}>
                                                                    {msg.senderDisplayName}:
                                                                </Box>
                                                            )}
                                                            {highlightText(msg.message, sidebarSearch)}
                                                        </Typography>
                                                    </ListItemContent>
                                                </ListItem>
                                            ))}
                                        </>
                                    )}
                                </>
                            )}
                    </List>
                )}
            </Box>
        </>
    );
};