import React, { useState, useMemo } from 'react';
import {
    Box, List, Typography, Button, ListItem,
    Avatar, Input, FormControl, FormLabel,
    Stack, Alert, Checkbox, Chip, IconButton, Divider,
} from '@mui/joy';
import { SidebarHeader, NewChatHeader } from './SidebarHeader.js';
import { SidebarSearch } from './SidebarSearch.js';
import { ContactItem } from './ContactItem.js';
import { GroupItem } from './GroupItem.js';
import { Group } from '../../types/chat.js';
import GroupsIcon from '@mui/icons-material/Groups';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { SidebarView, SidebarFilter, useNavigationStore } from '../../store/useNavigationStore.js';

// ── Estado vacío genérico ──
const EmptyState: React.FC<{
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    action?: { label: string; onClick: () => void };
}> = ({ icon, title, subtitle, action }) => (
    <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        px: 3,
        py: 6,
        textAlign: 'center',
        color: 'text.tertiary',
    }}>
        <Box sx={{ fontSize: 48, opacity: 0.35 }}>{icon}</Box>
        <Typography level="title-md" sx={{ fontWeight: 600, color: 'text.secondary' }}>{title}</Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary', maxWidth: 220 }}>{subtitle}</Typography>
        {action && (
            <Button size="sm" variant="soft" color="primary" onClick={action.onClick} sx={{ mt: 0.5 }}>
                {action.label}
            </Button>
        )}
    </Box>
);

// ── Cabecera sub-vista ──
const SubViewHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
    <Box sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 0.75,
        minHeight: 56,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.surface',
        gap: 0.5,
        flexShrink: 0,
    }}>
        <IconButton variant="plain" color="neutral" onClick={onBack} size="sm">
            <ArrowBackIcon />
        </IconButton>
        <Typography level="title-md" sx={{ fontWeight: 600, ml: 0.5 }}>{title}</Typography>
    </Box>
);

// ── Formulario inline: Añadir contacto ──
const AddContactForm: React.FC<{
    onAdd: (id: string, name: string) => void;
    onDone: () => void;
}> = ({ onAdd, onDone }) => {
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!id.includes('@')) {
            setError('Formato inválido. Usa: UPeerID@IP');
            return;
        }
        const [upeerId, ip] = id.split('@');
        if (!upeerId || !ip) {
            setError('Formato incompleto. Incluye el ID y la IP.');
            return;
        }
        const normalizedIp = ip.trim();
        const segments = normalizedIp.split(':');
        // BUG DW fix: validar rango completo 200::/7 (200:-3ff:), igual que main.ts
        const YGG_REGEX = /^[23][0-9a-f]{2}:/i;
        if (!YGG_REGEX.test(normalizedIp) || segments.length !== 8) {
            setError('Dirección Yggdrasil inválida. Debe tener 8 segmentos comenzando con 200:-3ff:');
            return;
        }
        if (upeerId && name) {
            onAdd(`${upeerId}@${normalizedIp}`, name.trim());
            setId(''); setName(''); setError('');
            onDone();
        }
    };

    return (
        <Box sx={{ px: 2, py: 2.5, flexGrow: 1, overflowY: 'auto' }}>
            <Typography level="body-sm" sx={{ mb: 2.5, color: 'text.secondary' }}>
                Introduce la <b>identidad upeer</b> completa de tu contacto en formato <b>ID@IP</b>.
            </Typography>
            {error && (
                <Alert
                    variant="soft" color="danger"
                    startDecorator={<InfoOutlined />}
                    sx={{ mb: 2, py: 1 }}
                >
                    {error}
                </Alert>
            )}
            <form onSubmit={handleSubmit}>
                <Stack spacing={2.5}>
                    <FormControl required>
                        <FormLabel sx={{ fontWeight: 600, fontSize: '12px' }}>Identidad upeer (ID@IP)</FormLabel>
                        <Input
                            autoFocus
                            placeholder="fc33aa0e…@200:7704:49e5:b4cd:7910:2191:2574:351b"
                            value={id}
                            onChange={(e) => { setId(e.target.value); if (error) setError(''); }}
                            sx={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: 'background.level1' }}
                        />
                        <Typography level="body-xs" sx={{ mt: 0.5, opacity: 0.6 }}>
                            Formato: UPeerID@200:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx
                        </Typography>
                    </FormControl>
                    <FormControl required>
                        <FormLabel sx={{ fontWeight: 600, fontSize: '12px' }}>Alias del contacto</FormLabel>
                        <Input
                            placeholder="Nombre o apodo para identificarlo"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            sx={{ backgroundColor: 'background.level1' }}
                        />
                    </FormControl>
                    <Button
                        type="submit"
                        fullWidth
                        disabled={!id.trim() || !name.trim()}
                    >
                        Añadir contacto
                    </Button>
                </Stack>
            </form>
        </Box>
    );
};

// ── Formulario inline: Crear grupo ──
const CreateGroupForm: React.FC<{
    contacts: Contact[];
    onCreate: (name: string, memberIds: string[], avatar?: string) => Promise<any>;
    onDone: () => void;
}> = ({ contacts, onCreate, onDone }) => {
    const [groupName, setGroupName] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [groupAvatar, setGroupAvatar] = useState<string | undefined>();
    const avatarInputRef = React.useRef<HTMLInputElement>(null);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = Math.min(img.width, img.height, 256);
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d')!;
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
                setGroupAvatar(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const connectedContacts = useMemo(() =>
        contacts.filter(c => c.status === 'connected'), [contacts]
    );
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return q ? connectedContacts.filter(c => c.name.toLowerCase().includes(q)) : connectedContacts;
    }, [connectedContacts, search]);

    const toggleMember = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const selectedContacts = useMemo(() =>
        connectedContacts.filter(c => selectedIds.includes(c.upeerId)), [connectedContacts, selectedIds]
    );

    const handleCreate = async () => {
        if (!groupName.trim() || selectedIds.length === 0) return;
        setLoading(true);
        try {
            await onCreate(groupName.trim(), selectedIds, groupAvatar);
            onDone();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ px: 2, py: 2, flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Crea un grupo de chat seguro con tus contactos conectados.
            </Typography>

            {/* Avatar picker */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <input
                    type="file"
                    accept="image/*"
                    ref={avatarInputRef}
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                />
                <Box
                    onClick={() => avatarInputRef.current?.click()}
                    sx={{
                        position: 'relative', cursor: 'pointer',
                        width: 80, height: 80,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '2px dashed',
                        borderColor: 'divider',
                        '&:hover .avatar-overlay': { opacity: 1 },
                    }}
                >
                    <Avatar
                        src={groupAvatar}
                        sx={{
                            width: '100%', height: '100%', borderRadius: '50%',
                            background: groupAvatar ? undefined : 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))'
                        }}
                    >
                        {!groupAvatar && <GroupsIcon sx={{ fontSize: 32, color: 'white' }} />}
                    </Avatar>
                    <Box className="avatar-overlay" sx={{
                        position: 'absolute', inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: groupAvatar ? 0 : 0.6,
                        transition: 'opacity 0.2s',
                    }}>
                        <CameraAltIcon sx={{ color: 'white', fontSize: 24 }} />
                    </Box>
                </Box>
            </Box>
            <FormControl required>
                <FormLabel sx={{ fontWeight: 600, fontSize: '12px' }}>Nombre del grupo</FormLabel>
                <Input
                    autoFocus
                    placeholder="Ej: Equipo, Familia…"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    sx={{ backgroundColor: 'background.level1' }}
                />
            </FormControl>
            <Divider>Miembros ({selectedIds.length})</Divider>
            {selectedContacts.length > 0 && (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {selectedContacts.map(c => (
                        <Chip
                            key={c.upeerId}
                            variant="soft" color="primary" size="sm"
                            onClick={() => toggleMember(c.upeerId)}
                            endDecorator={<span style={{ cursor: 'pointer' }}>×</span>}
                        >
                            {c.name}
                        </Chip>
                    ))}
                </Stack>
            )}
            <Input
                placeholder="Buscar contactos…"
                size="sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
                startDecorator={<SearchIcon sx={{ opacity: 0.5, fontSize: '18px' }} />}
            />
            <Box sx={{
                flex: 1, overflowY: 'auto', minHeight: 120,
                border: '1px solid', borderColor: 'divider',
                borderRadius: 'md', backgroundColor: 'background.level1',
            }}>
                {connectedContacts.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography level="body-sm" color="neutral">No tienes contactos conectados</Typography>
                    </Box>
                ) : filtered.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography level="body-sm" color="neutral">Sin resultados</Typography>
                    </Box>
                ) : (
                    <List size="sm" sx={{ '--List-padding': '4px', gap: 0.25 }}>
                        {filtered.map(c => {
                            const isChecked = selectedIds.includes(c.upeerId);
                            return (
                                <ListItem
                                    key={c.upeerId}
                                    onClick={() => toggleMember(c.upeerId)}
                                    sx={{
                                        borderRadius: 'sm', cursor: 'pointer',
                                        bgcolor: isChecked ? 'primary.softBg' : 'transparent',
                                        '&:hover': { bgcolor: isChecked ? 'primary.softBg' : 'background.level3' },
                                        py: 0.75, px: 1,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                        <Checkbox
                                            checked={isChecked}
                                            onChange={() => toggleMember(c.upeerId)}
                                            size="sm"
                                        />
                                        <Avatar size="sm" variant="soft" src={c.avatar || undefined}>
                                            {c.name.charAt(0).toUpperCase()}
                                        </Avatar>
                                        <Typography level="body-sm" sx={{ fontWeight: isChecked ? 600 : 400 }}>
                                            {c.name}
                                        </Typography>
                                    </Box>
                                </ListItem>
                            );
                        })}
                    </List>
                )}
            </Box>
            <Button
                fullWidth
                disabled={!groupName.trim() || selectedIds.length === 0 || loading}
                loading={loading}
                onClick={handleCreate}
            >
                Crear grupo
            </Button>
        </Box>
    );
};

interface Contact {
    upeerId: string;
    address: string;
    name: string;
    status: 'pending' | 'incoming' | 'connected' | 'blocked';
    avatar?: string;
    lastSeen?: string;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageIsMine?: boolean;
    lastMessageStatus?: string;
}

interface SidebarProps {
    contacts: Contact[];
    groups?: Group[];
    onSelectContact: (id: string) => void;
    onSelectGroup?: (groupId: string) => void;
    onDeleteContact: (id: string) => void;
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
    onLeaveGroup,
    selectedId,
    selectedGroupId,
    onAddContact,
    onShowMyIdentity,
    typingStatus = {},
    onCreateGroup,
}) => {
    const {
        sidebarView: view,
        sidebarFilter: filter,
        newChatSearch,
        setSidebarView: setView,
        setSidebarFilter: setFilter,
        setNewChatSearch,
        openNewChat,
        backToList,
    } = useNavigationStore();

    const filteredGroups = useMemo(() => {
        if (filter === 'unread' || filter === 'favorites') return [];
        return groups;
    }, [groups, filter]);

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
        // list=base(0), new=stack 1(+100), add-contact=stack 2(+200), create-group=stack 2(+200)
        if (view === v) return 'translateX(0)';
        // Si la vista activa es más "a la derecha" que la especificada, ésta sale por la izquierda
        const order: SidebarView[] = ['list', 'new', 'add-contact'];
        // create-group está en el mismo nivel de profundidad que add-contact
        const orderMap: Record<SidebarView, number> = { list: 0, new: 1, 'add-contact': 2, 'create-group': 2 };
        return orderMap[view] > orderMap[v] ? 'translateX(-100%)' : 'translateX(100%)';
    };

    const panelSx = (v: SidebarView) => {
        const isActive = view === v;
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
                    onCreateGroup={onCreateGroup ? () => setView('create-group') : undefined}
                />
                <SidebarSearch activeFilter={filter} onFilterChange={(f) => setFilter(f as SidebarFilter)} />
                <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {filter === 'all' && (
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
                                            : <ContactItem key={entry.data.upeerId} contact={entry.data} isSelected={selectedId === entry.data.upeerId} onSelect={onSelectContact} onDelete={onDeleteContact} isTyping={!!typingStatus[entry.data.upeerId]} />
                                    )}
                                </List>
                            )}
                        </>
                    )}
                    {filter === 'groups' && (
                        groups.length === 0 ? (
                            <EmptyState
                                icon={<GroupsIcon sx={{ fontSize: 'inherit' }} />}
                                title="Sin grupos"
                                subtitle="Crea un grupo para hablar con varias personas a la vez."
                                action={onCreateGroup ? { label: 'Crear grupo', onClick: () => setView('create-group') } : undefined}
                            />
                        ) : (
                            <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                                {filteredGroups.map((g) => (
                                    <GroupItem key={g.groupId} group={g} isSelected={selectedGroupId === g.groupId} onSelect={onSelectGroup || (() => { })} onLeaveGroup={onLeaveGroup} />
                                ))}
                            </List>
                        )
                    )}
                    {filter === 'unread' && <EmptyState icon={<NotificationsOffIcon sx={{ fontSize: 'inherit' }} />} title="Sin mensajes no leídos" subtitle="Estás al día. Aquí aparecerán los chats con mensajes nuevos." />}
                    {filter === 'favorites' && <EmptyState icon={<StarBorderIcon sx={{ fontSize: 'inherit' }} />} title="Sin favoritos" subtitle="Marca contactos como favoritos para encontrarlos rápidamente aquí." />}
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
                                onClick={() => setView('add-contact')}
                                sx={{
                                    display: 'flex', alignItems: 'center',
                                    height: '60px', px: 2, gap: 1.5,
                                    cursor: 'pointer',
                                    '&:hover': { backgroundColor: 'background.level1' },
                                }}
                            >
                                <Avatar size="md" color="primary" variant="soft" sx={{ flexShrink: 0 }}>
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
                                    onClick={() => setView('create-group')}
                                    sx={{
                                        display: 'flex', alignItems: 'center',
                                        height: '60px', px: 2, gap: 1.5,
                                        cursor: 'pointer',
                                        '&:hover': { backgroundColor: 'background.level1' },
                                    }}
                                >
                                    <Avatar size="md" color="primary" variant="soft" sx={{ flexShrink: 0 }}>
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
                <SubViewHeader title="Añadir contacto" onBack={() => setView('new')} />
                <AddContactForm
                    onAdd={onAddContact}
                    onDone={() => setView('list')}
                />
            </Box>

            {/* ══ Panel 2b: Crear grupo ═══════════════════════════ */}
            <Box sx={panelSx('create-group')}>
                <SubViewHeader title="Nuevo grupo" onBack={() => setView(view === 'create-group' && filter === 'groups' ? 'list' : 'new')} />
                {onCreateGroup && (
                    <CreateGroupForm
                        contacts={contacts}
                        onCreate={onCreateGroup}
                        onDone={() => setView('list')}
                    />
                )}
            </Box>

        </Box>
    );
};
