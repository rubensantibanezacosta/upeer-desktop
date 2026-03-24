import React, { useState, useMemo } from 'react';
import {
    Box, Typography, Input, FormControl, FormLabel, Stack,
    Button, Divider, List, ListItem, Checkbox, Avatar, Chip
} from '@mui/joy';
import GroupsIcon from '@mui/icons-material/Groups';
import SearchIcon from '@mui/icons-material/Search';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { Contact } from '../../../types/chat.js';
import { resizeImageToDataUrl } from '../../ui/settings/shared.js';


interface CreateGroupFormProps {
    contacts: Contact[];
    onCreate: (name: string, memberIds: string[], avatar?: string) => Promise<any>;
    onDone: () => void;
}

export const CreateGroupForm: React.FC<CreateGroupFormProps> = ({
    contacts,
    onCreate,
    onDone
}) => {
    const [groupName, setGroupName] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [groupAvatar, setGroupAvatar] = useState<string | undefined>();
    const avatarInputRef = React.useRef<HTMLInputElement>(null);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        resizeImageToDataUrl(file)
            .then(setGroupAvatar)
            .catch(() => undefined);
        e.target.value = '';
    };

    const availableContacts = useMemo(() =>
        contacts.filter(c => !c.isConversationOnly && c.status !== 'blocked' && c.status !== 'incoming' && c.status !== 'pending'), [contacts]
    );
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return q
            ? availableContacts.filter(c => c.name.toLowerCase().includes(q) || c.upeerId.toLowerCase().includes(q))
            : availableContacts;
    }, [availableContacts, search]);

    const toggleMember = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const selectedContacts = useMemo(() =>
        availableContacts.filter(c => selectedIds.includes(c.upeerId)), [availableContacts, selectedIds]
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
                Crea un grupo de chat seguro con tus contactos disponibles. Los que estén offline recibirán la invitación cuando vuelvan a estar accesibles.
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
                        borderRadius: 'lg',
                        overflow: 'hidden',
                        border: '2px dashed',
                        borderColor: 'divider',
                        '&:hover .avatar-overlay': { opacity: 1 },
                    }}
                >
                    <Avatar
                        src={groupAvatar}
                        sx={{
                            width: '100%', height: '100%', borderRadius: 'lg',
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
                {availableContacts.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography level="body-sm" color="neutral">No tienes contactos disponibles</Typography>
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
                                        <Typography level="body-xs" color="neutral" sx={{ ml: 'auto' }}>
                                            {c.status === 'connected' ? 'Online' : 'Offline'}
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