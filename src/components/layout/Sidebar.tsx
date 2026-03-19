import React, { useMemo } from 'react';
import {
    Box, List, Typography,
    Avatar,
} from '@mui/joy';
import { SidebarHeader, NewChatHeader } from './SidebarHeader.js';
import { SidebarSearch } from './SidebarSearch.js';
import { ContactItem } from './ContactItem.js';
import { GroupItem } from './GroupItem.js';
import { Group, Contact } from '../../types/chat.js';
import GroupsIcon from '@mui/icons-material/Groups';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import { SidebarView, SidebarFilter, useNavigationStore } from '../../store/useNavigationStore.js';

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
    onDeleteContact: (id: string) => void;
    onClearChat: (id: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    selectedId?: string;
    selectedGroupId?: string;
    typingStatus?: Record<string, any>;
    onAddContact: (idAtAddress: string, name: string) => void;
    onShowMyIdentity: () => void;
    onCreateGroup?: (name: string, memberIds: string[], avatar?: string) => Promise<any>;
}

export const Sidebar: React.FC<SidebarProps> = ({
    contacts,
    groups = [],
    onSelectContact,
    onSelectGroup,
    onDeleteContact,
    onClearChat,
    onLeaveGroup,
    selectedId,
    selectedGroupId,
    onAddContact,
    onShowMyIdentity,
    typingStatus = {},
    onCreateGroup,
}) => {
    const {
        sidebarView,
        sidebarFilter,
        newChatSearch,
        setSidebarView,
        setSidebarFilter,
        openNewChat,
        backToList,
    } = useNavigationStore();

    const filteredGroups = useMemo(() => {
        if (sidebarFilter === 'unread' || sidebarFilter === 'favorites') return [];
        return groups;
    }, [groups, sidebarFilter]);

    const mergedList = useMemo(() => {
        type Entry =
            | { kind: 'group'; data: Group; time: number }
            | { kind: 'contact'; data: Contact; time: number };
        const entries: Entry[] = [
            ...groups.map(g => ({
                kind: 'group' as const,
                data: g,
                time: g.lastMessageTime ? new Date(g.lastMessageTime).getTime() : 0,
            })),
            ...contacts.filter(c => c.status !== 'blocked').map(c => ({
                kind: 'contact' as const,
                data: c,
                time: c.lastMessageTime ? new Date(c.lastMessageTime).getTime() : 0,
            })),
        ];
        return entries.sort((a, b) => b.time - a.time);
    }, [groups, contacts]);

    const searchedContacts = useMemo(() => {
        const q = newChatSearch.trim().toLowerCase();
        if (!q) return contacts.filter(c => c.status === 'connected');
        return contacts.filter(c =>
            c.status !== 'blocked' &&
            (c.name?.toLowerCase().includes(q) ||
                c.upeerId?.toLowerCase().includes(q))
        );
    }, [contacts, newChatSearch]);

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
                    onShowMyIdentity={onShowMyIdentity}
                    onAddNew={handleOpenNew}
                    onCreateGroup={onCreateGroup ? () => setSidebarView('create-group') : undefined}
                />
                <SidebarSearch activeFilter={sidebarFilter} onFilterChange={(f) => setSidebarFilter(f as SidebarFilter)} />
                <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {sidebarFilter === 'all' && (
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
                                    {mergedList.map(entry =>
                                        entry.kind === 'group'
                                            ? <GroupItem key={entry.data.groupId} group={entry.data} isSelected={selectedGroupId === entry.data.groupId} onSelect={onSelectGroup || (() => { })} onLeaveGroup={onLeaveGroup} />
                                            : <ContactItem key={entry.data.upeerId} contact={entry.data} isSelected={selectedId === entry.data.upeerId} onSelect={onSelectContact} onDelete={onDeleteContact} onClear={onClearChat} isTyping={!!typingStatus[entry.data.upeerId]} />
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
                                    <GroupItem key={g.groupId} group={g} isSelected={selectedGroupId === g.groupId} onSelect={onSelectGroup || (() => { })} onLeaveGroup={onLeaveGroup} />
                                ))}
                            </List>
                        )
                    )}
                    {sidebarFilter === 'unread' && <EmptyState icon={<NotificationsOffIcon sx={{ fontSize: 'inherit' }} />} title="Sin mensajes no leídos" subtitle="Estás al día. Aquí aparecerán los chats con mensajes nuevos." />}
                    {sidebarFilter === 'favorites' && <EmptyState icon={<StarBorderIcon sx={{ fontSize: 'inherit' }} />} title="Sin favoritos" subtitle="Marca contactos como favoritos para encontrarlos rápidamente aquí." />}
                </Box>
            </Box>

            {/* ══ Panel 1: Nuevo chat ════════════════════════════ */}
            <Box sx={panelSx('new')}>
                <NewChatHeader onBack={handleBack} />
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
                                onDelete={() => { }}
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