import React from 'react';
import { Avatar, Box, List, ListItem, ListItemContent, ListItemDecorator, Typography } from '@mui/joy';
import GroupsIcon from '@mui/icons-material/Groups';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { SidebarHeader } from '../SidebarHeader.js';
import { SidebarSearch } from '../SidebarSearch.js';
import { ContactItem } from '../ContactItem.js';
import { GroupItem } from '../GroupItem.js';
import { highlightText } from '../../../utils/highlightText.js';
import { EmptyState } from './EmptyState.js';
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
    onLeaveGroup?: (groupId: string) => void;
    onOpenNew: () => void;
    onFilterChange: (filter: SidebarFilter) => void;
    onSearchChange: (value: string) => void;
    onSelectMessage: (msg: ChatMessage) => void;
    onOpenCreateGroup?: () => void;
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
    onLeaveGroup,
    onOpenNew,
    onFilterChange,
    onSearchChange,
    onSelectMessage,
    onOpenCreateGroup,
}) => (
    <>
        <SidebarHeader onAddNew={onOpenNew} onCreateGroup={onOpenCreateGroup} />
        <SidebarSearch value={sidebarSearch} onChange={onSearchChange} activeFilter={sidebarFilter} onFilterChange={(filter) => onFilterChange(filter as SidebarFilter)} />
        <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {(sidebarFilter === 'all' || sidebarFilter === 'favorites') && (
                <>
                    {groups.length === 0 && contacts.length === 0 ? (
                        <EmptyState
                            icon={<ChatBubbleOutlineIcon sx={{ fontSize: 'inherit' }} />}
                            title="Sin conversaciones"
                            subtitle="Añade un contacto para empezar a chatear de forma segura."
                            action={{ label: 'Nueva conversación', onClick: onOpenNew }}
                        />
                    ) : (
                        <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                            {sidebarSearch && (
                                <Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
                                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                                        Chats
                                    </Typography>
                                </Box>
                            )}
                            {mergedList.map((entry) =>
                                entry.kind === 'group'
                                    ? <GroupItem key={entry.data.groupId} group={entry.data} isSelected={selectedGroupId === entry.data.groupId} onSelect={onSelectGroup || (() => undefined)} onToggleFavorite={onToggleFavoriteGroup} onLeaveGroup={onLeaveGroup} highlight={sidebarSearch} />
                                    : <ContactItem key={entry.data.upeerId} contact={entry.data} isSelected={selectedId === entry.data.upeerId} onSelect={onSelectContact} onToggleFavorite={onToggleFavorite} onClear={onClearChat} isTyping={!!typingStatus[entry.data.upeerId]} highlight={sidebarSearch} />,
                            )}

                            {sidebarFilter === 'all' && sidebarSearch && searchResults.length > 0 && (
                                <>
                                    <Box sx={{ px: 2, pt: 3, pb: 0.5 }}>
                                        <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                                            Mensajes
                                        </Typography>
                                    </Box>
                                    {searchResults.map((msg) => (
                                        <ListItem
                                            key={msg.id}
                                            onClick={() => onSelectMessage(msg)}
                                            sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'background.level1' }, px: 2, py: 1.5 }}
                                        >
                                            <ListItemDecorator sx={{ mr: 1.5 }}>
                                                <Avatar size="sm" src={msg.senderAvatar || undefined} sx={{ borderRadius: 'sm' }}>
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

                            {sidebarFilter === 'all' && sidebarSearch && mergedList.length === 0 && searchResults.length === 0 && (
                                <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
                                    <Typography level="body-sm" color="neutral">Sin resultados para "{sidebarSearch}"</Typography>
                                </Box>
                            )}
                        </List>
                    )}
                </>
            )}
            {sidebarFilter === 'groups' && (
                groups.length === 0 ? (
                    <EmptyState
                        icon={<GroupsIcon sx={{ fontSize: 'inherit' }} />}
                        title="Sin grupos"
                        subtitle="Crea un grupo para hablar con varias personas a la vez."
                        action={onOpenCreateGroup ? { label: 'Crear grupo', onClick: onOpenCreateGroup } : undefined}
                    />
                ) : (
                    <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                        {filteredGroups.map((group) => (
                            <GroupItem key={group.groupId} group={group} isSelected={selectedGroupId === group.groupId} onSelect={onSelectGroup || (() => undefined)} onLeaveGroup={onLeaveGroup} highlight={sidebarSearch} />
                        ))}
                    </List>
                )
            )}
            {sidebarFilter === 'unread' && <EmptyState icon={<NotificationsOffIcon sx={{ fontSize: 'inherit' }} />} title="Sin mensajes no leídos" subtitle="Estás al día. Aquí aparecerán los chats con mensajes nuevos." />}
            {sidebarFilter === 'favorites' && mergedList.length === 0 && <EmptyState icon={<StarBorderIcon sx={{ fontSize: 'inherit' }} />} title="Sin favoritos" subtitle="Marca contactos o grupos como favoritos para encontrarlos rápidamente aquí." />}
        </Box>
    </>
);