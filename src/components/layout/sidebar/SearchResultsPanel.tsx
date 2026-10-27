import React from 'react';
import { Avatar, Box, Button, List, ListItem, ListItemContent, ListItemDecorator, Typography } from '@mui/joy';
import { MessageSquare } from 'lucide-react';
import { ContactItem } from '../ContactItem.js';
import { GroupItem } from '../GroupItem.js';
import { highlightText } from '../../../utils/highlightText.js';
import type { ChatMessage } from '../../../types/chat.js';
import type { SearchSection } from '../../../features/search/globalSearch.js';

const SECTION_TITLES: Record<SearchSection['kind'], string> = {
    chats: 'Chats',
    contacts: 'Contactos',
    groups: 'Grupos en común',
    messages: 'Mensajes',
};

interface SearchResultsPanelProps {
    sections: SearchSection[];
    query: string;
    selectedId?: string;
    selectedGroupId?: string;
    typingStatus: Record<string, NodeJS.Timeout>;
    messagesLoading: boolean;
    onSelectContact: (id: string) => void;
    onSelectGroup?: (groupId: string) => void;
    onToggleFavorite: (id: string) => void;
    onToggleFavoriteGroup: (groupId: string) => void;
    onClearChat: (id: string) => void;
    onClearGroupChat?: (groupId: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    onSelectMessage: (msg: ChatMessage) => void;
    onShowAllContacts: () => void;
    onLoadMoreMessages: () => void;
}

const sectionLabel = (label: string, total: number) => (
    <Box sx={{ px: 2, pb: 0.5, pt: 2 }}>
        <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
            {`${label} · ${total}`}
        </Typography>
    </Box>
);

const sectionFooter = (label: string, onClick: () => void, loading = false) => (
    <Box sx={{ px: 2, py: 1 }}>
        <Button size="sm" variant="plain" color="neutral" loading={loading} onClick={onClick} sx={{ fontWeight: 600 }}>
            {label}
        </Button>
    </Box>
);

const messageRow = (msg: ChatMessage, query: string, onSelect: (msg: ChatMessage) => void) => (
    <ListItem
        key={msg.id}
        data-search-row={msg.id}
        tabIndex={-1}
        onClick={() => onSelect(msg)}
        sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'background.level1' }, px: 2, py: 1.5 }}
    >
        <ListItemDecorator sx={{ mr: 1.5 }}>
            <Avatar size="sm" src={msg.senderAvatar || undefined}>
                {!msg.senderAvatar && <MessageSquare style={{ fontSize: 16 }} />}
            </Avatar>
        </ListItemDecorator>
        <ListItemContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                    {msg.senderName || 'Mensaje'}
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
                {highlightText(msg.message, query)}
            </Typography>
        </ListItemContent>
    </ListItem>
);

export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
    sections,
    query,
    selectedId,
    selectedGroupId,
    typingStatus,
    messagesLoading,
    onSelectContact,
    onSelectGroup,
    onToggleFavorite,
    onToggleFavoriteGroup,
    onClearChat,
    onClearGroupChat,
    onLeaveGroup,
    onSelectMessage,
    onShowAllContacts,
    onLoadMoreMessages,
}) => (
    <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
        {sections.map((section) => (
            <React.Fragment key={section.kind}>
                {sectionLabel(SECTION_TITLES[section.kind], section.total)}
                {section.kind === 'chats' && section.items.map((item) => (item.kind === 'group'
                    ? (
                        <GroupItem
                            key={item.group.groupId}
                            group={item.group}
                            searchRowId={item.group.groupId}
                            isSelected={selectedGroupId === item.group.groupId}
                            onSelect={onSelectGroup || (() => undefined)}
                            onToggleFavorite={onToggleFavoriteGroup}
                            onLeaveGroup={onLeaveGroup}
                            onClearChat={onClearGroupChat}
                            highlight={query}
                        />
                    )
                    : (
                        <ContactItem
                            key={item.contact.upeerId}
                            contact={item.contact}
                            searchRowId={item.contact.upeerId}
                            isSelected={selectedId === item.contact.upeerId}
                            onSelect={onSelectContact}
                            onToggleFavorite={onToggleFavorite}
                            onClear={onClearChat}
                            isTyping={!!typingStatus[item.contact.upeerId]}
                            highlight={query}
                        />
                    )))}
                {section.kind === 'contacts' && section.items.map((item) => (
                    <ContactItem
                        key={item.contact.upeerId}
                        contact={item.contact}
                        searchRowId={item.contact.upeerId}
                        isSelected={selectedId === item.contact.upeerId}
                        onSelect={onSelectContact}
                        onToggleFavorite={onToggleFavorite}
                        onClear={onClearChat}
                        isTyping={!!typingStatus[item.contact.upeerId]}
                        highlight={query}
                    />
                ))}
                {section.kind === 'groups' && section.items.map((item) => (
                    <React.Fragment key={item.group.groupId}>
                        <GroupItem
                            group={item.group}
                            searchRowId={item.group.groupId}
                            isSelected={selectedGroupId === item.group.groupId}
                            onSelect={onSelectGroup || (() => undefined)}
                            onToggleFavorite={onToggleFavoriteGroup}
                            onLeaveGroup={onLeaveGroup}
                            onClearChat={onClearGroupChat}
                            highlight={query}
                        />
                        {item.sharedBy && (
                            <Typography level="body-xs" sx={{ px: 2, pb: 0.5, color: 'text.tertiary' }}>
                                Compartido con {item.sharedBy}
                            </Typography>
                        )}
                    </React.Fragment>
                ))}
                {section.kind === 'messages' && section.items.map((msg) => messageRow(msg, query, onSelectMessage))}
                {section.kind === 'contacts' && section.total > section.items.length && sectionFooter('Ver todos los contactos', onShowAllContacts)}
                {section.kind === 'messages' && section.total > section.items.length && sectionFooter('Ver más mensajes', onLoadMoreMessages, messagesLoading)}
            </React.Fragment>
        ))}
    </List>
);
