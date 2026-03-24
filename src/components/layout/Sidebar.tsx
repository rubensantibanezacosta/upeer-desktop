import React, { useMemo, useEffect } from 'react';
import {
    Box, List, Typography,
    Avatar, ListItem, ListItemContent, ListItemDecorator,
} from '@mui/joy';
import { SidebarHeader, NewChatHeader } from './SidebarHeader.js';
import { SidebarSearch } from './SidebarSearch.js';
import { ContactItem } from './ContactItem.js';
import { GroupItem } from './GroupItem.js';
import { Group, Contact, ChatMessage } from '../../types/chat.js';
import GroupsIcon from '@mui/icons-material/Groups';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import { SidebarView, SidebarFilter, useNavigationStore } from '../../store/useNavigationStore.js';
import { useChatStore } from '../../store/useChatStore.js';
import { highlightText } from '../../utils/highlightText.js';

// Import subcomponents
import { EmptyState } from './sidebar/EmptyState.js';
import { SubViewHeader } from './sidebar/SubViewHeader.js';
import { AddContactForm } from './sidebar/AddContactForm.js';
import { CreateGroupForm } from './sidebar/CreateGroupForm.js';

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

    // ── helpers de animación: 4 posibles vistas ──────────────
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
            // visibility se anima junto al transform: al activarse aparece de golpe (delay 0),
            // al desactivarse espera a que termine el transform antes de ocultarse.
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

            {/* ══ Panel 0: Lista principal ══════════════════════ */}
            <Box sx={panelSx('list')}>
                <SidebarHeader
                    onAddNew={handleOpenNew}
                    onCreateGroup={onCreateGroup ? () => setSidebarView('create-group') : undefined}
                />
                <SidebarSearch
                    value={sidebarSearch}
                    onChange={setSidebarSearch}
                    activeFilter={sidebarFilter}
                    onFilterChange={(f) => setSidebarFilter(f as SidebarFilter)}
                />
                <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {(sidebarFilter === 'all' || sidebarFilter === 'favorites') && (
                        <>
                            {groups.length === 0 && contacts.length === 0 ? (
                                <EmptyState
                                    icon={<ChatBubbleOutlineIcon sx={{ fontSize: 'inherit' }} />}
                                    title="Sin conversaciones"
                                    subtitle="Añade un contacto para empezar a chatear de forma segura."
                                    action={{ label: 'Nueva conversación', onClick: handleOpenNew }}
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
                                    {mergedList.map(entry =>
                                        entry.kind === 'group'
                                            ? <GroupItem key={entry.data.groupId} group={entry.data} isSelected={selectedGroupId === entry.data.groupId} onSelect={onSelectGroup || (() => { })} onToggleFavorite={onToggleFavoriteGroup} onLeaveGroup={onLeaveGroup} highlight={sidebarSearch} />
                                            : <ContactItem key={entry.data.upeerId} contact={entry.data} isSelected={selectedId === entry.data.upeerId} onSelect={onSelectContact} onToggleFavorite={onToggleFavorite} onClear={onClearChat} isTyping={!!typingStatus[entry.data.upeerId]} highlight={sidebarSearch} />
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
                                                    onClick={() => handleSelectMessage(msg)}
                                                    sx={{
                                                        cursor: 'pointer',
                                                        '&:hover': { backgroundColor: 'background.level1' },
                                                        px: 2,
                                                        py: 1.5,
                                                    }}
                                                >
                                                    <ListItemDecorator sx={{ mr: 1.5 }}>
                                                        <Avatar
                                                            size="sm"
                                                            src={msg.senderAvatar || undefined}
                                                            sx={{ borderRadius: 'sm' }}
                                                        >
                                                            {!msg.senderAvatar && <ChatBubbleOutlineIcon />}
                                                        </Avatar>
                                                    </ListItemDecorator>
                                                    <ListItemContent>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                                            <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                                                                {(msg as any).senderName || 'Mensaje'}
                                                            </Typography>
                                                            <Typography level="body-xs" sx={{ opacity: 0.6 }}>
                                                                {msg.timestamp}
                                                            </Typography>
                                                        </Box>
                                                        <Typography
                                                            level="body-xs"
                                                            sx={{
                                                                color: 'text.secondary',
                                                                display: '-webkit-box',
                                                                WebkitLineClamp: 2,
                                                                WebkitBoxOrient: 'vertical',
                                                                whiteSpace: 'normal',
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {(msg as any).senderDisplayName && (
                                                                <Box component="span" sx={{ fontWeight: 600, mr: 0.5 }}>
                                                                    {(msg as any).senderDisplayName}:
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
                                action={onCreateGroup ? { label: 'Crear grupo', onClick: () => setSidebarView('create-group') } : undefined}
                            />
                        ) : (
                            <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                                {filteredGroups.map((g) => (
                                    <GroupItem key={g.groupId} group={g} isSelected={selectedGroupId === g.groupId} onSelect={onSelectGroup || (() => { })} onLeaveGroup={onLeaveGroup} highlight={sidebarSearch} />
                                ))}
                            </List>
                        )
                    )}
                    {sidebarFilter === 'unread' && <EmptyState icon={<NotificationsOffIcon sx={{ fontSize: 'inherit' }} />} title="Sin mensajes no leídos" subtitle="Estás al día. Aquí aparecerán los chats con mensajes nuevos." />}
                    {sidebarFilter === 'favorites' && mergedList.length === 0 && <EmptyState icon={<StarBorderIcon sx={{ fontSize: 'inherit' }} />} title="Sin favoritos" subtitle="Marca contactos o grupos como favoritos para encontrarlos rápidamente aquí." />}
                </Box>
            </Box>

            {/* ══ Panel 1: Nuevo chat ════════════════════════════ */}
            <Box sx={panelSx('new')}>
                <NewChatHeader onBack={handleBack} />
                <SidebarSearch
                    value={newChatSearch}
                    onChange={setNewChatSearch}
                    placeholder="Buscar contactos"
                    showFilters={false}
                    autoFocus={sidebarView === 'new'}
                    focusKey={sidebarView}
                />
                <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {!newChatSearch && (
                        <Box>
                            {/* Acción: Nueva conversación */}
                            <Box
                                onClick={() => setSidebarView('add-contact')}
                                sx={{
                                    display: 'flex', alignItems: 'center',
                                    height: '60px', px: 2, gap: 1.5,
                                    cursor: 'pointer',
                                    '&:hover': { backgroundColor: 'background.level1' },
                                }}
                            >
                                <Avatar size="md" color="primary" variant="soft" sx={{ flexShrink: 0, borderRadius: 'md' }}>
                                    <PersonAddIcon />
                                </Avatar>
                                <Box>
                                    <Typography level="body-md" sx={{ fontWeight: 500 }}>Nueva conversación</Typography>
                                    <Typography level="body-sm" color="neutral">Añadir un contacto nuevo</Typography>
                                </Box>
                            </Box>
                            {/* Acción: Nuevo grupo */}
                            {onCreateGroup && (
                                <Box
                                    onClick={() => setSidebarView('create-group')}
                                    sx={{
                                        display: 'flex', alignItems: 'center',
                                        height: '60px', px: 2, gap: 1.5,
                                        cursor: 'pointer',
                                        '&:hover': { backgroundColor: 'background.level1' },
                                    }}
                                >
                                    <Avatar size="md" color="primary" variant="soft" sx={{ flexShrink: 0, borderRadius: 'md' }}>
                                        <GroupAddIcon />
                                    </Avatar>
                                    <Box>
                                        <Typography level="body-md" sx={{ fontWeight: 500 }}>Nuevo grupo</Typography>
                                        <Typography level="body-sm" color="neutral">Crear un grupo de conversación</Typography>
                                    </Box>
                                </Box>
                            )}
                            {searchedContacts.length > 0 && (
                                <Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
                                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                                        Contactos
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                    <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                        {searchedContacts.map((c, i) => (
                            <ContactItem
                                key={c.upeerId || i}
                                contact={c}
                                isSelected={false}
                                onSelect={handleSelectExisting}
                                onClear={() => { }}
                                isTyping={false}
                            />
                        ))}
                        {searchedContacts.length === 0 && newChatSearch.trim() !== '' && (
                            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
                                <Typography level="body-sm" color="neutral">Sin resultados para "{newChatSearch}"</Typography>
                            </Box>
                        )}
                    </List>
                </Box>
            </Box>

            {/* ══ Panel 2a: Añadir contacto ══════════════════════ */}
            <Box sx={panelSx('add-contact')}>
                <SubViewHeader title="Añadir contacto" onBack={() => setSidebarView('new')} />
                <AddContactForm
                    onAdd={onAddContact}
                    onDone={() => setSidebarView('list')}
                />
            </Box>

            {/* ══ Panel 2b: Crear grupo ═══════════════════════════ */}
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