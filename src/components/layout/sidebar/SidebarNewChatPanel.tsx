import React from 'react';
import { Avatar, Box, List, Typography } from '@mui/joy';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import { NewChatHeader } from '../SidebarHeader.js';
import { SidebarSearch } from '../SidebarSearch.js';
import { ContactItem } from '../ContactItem.js';
import type { Contact } from '../../../types/chat.js';

interface SidebarNewChatPanelProps {
    sidebarView: string;
    newChatSearch: string;
    searchedContacts: Contact[];
    onBack: () => void;
    onSearchChange: (value: string) => void;
    onOpenAddContact: () => void;
    onOpenCreateGroup?: () => void;
    onSelectExisting: (id: string) => void;
}

export const SidebarNewChatPanel: React.FC<SidebarNewChatPanelProps> = ({
    sidebarView,
    newChatSearch,
    searchedContacts,
    onBack,
    onSearchChange,
    onOpenAddContact,
    onOpenCreateGroup,
    onSelectExisting,
}) => (
    <>
        <NewChatHeader onBack={onBack} />
        <SidebarSearch value={newChatSearch} onChange={onSearchChange} placeholder="Buscar contactos" showFilters={false} autoFocus={sidebarView === 'new'} focusKey={sidebarView} />
        <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {!newChatSearch && (
                <Box>
                    <Box onClick={onOpenAddContact} sx={{ display: 'flex', alignItems: 'center', height: '60px', px: 2, gap: 1.5, cursor: 'pointer', '&:hover': { backgroundColor: 'background.level1' } }}>
                        <Avatar size="md" color="primary" variant="soft" sx={{ flexShrink: 0, borderRadius: 'md' }}>
                            <PersonAddIcon />
                        </Avatar>
                        <Box>
                            <Typography level="body-md" sx={{ fontWeight: 500 }}>Nueva conversación</Typography>
                            <Typography level="body-sm" color="neutral">Añadir un contacto nuevo</Typography>
                        </Box>
                    </Box>
                    {onOpenCreateGroup && (
                        <Box onClick={onOpenCreateGroup} sx={{ display: 'flex', alignItems: 'center', height: '60px', px: 2, gap: 1.5, cursor: 'pointer', '&:hover': { backgroundColor: 'background.level1' } }}>
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
                {searchedContacts.map((contact, index) => (
                    <ContactItem key={contact.upeerId || index} contact={contact} isSelected={false} onSelect={onSelectExisting} onClear={() => undefined} isTyping={false} />
                ))}
                {searchedContacts.length === 0 && newChatSearch.trim() !== '' && (
                    <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
                        <Typography level="body-sm" color="neutral">Sin resultados para "{newChatSearch}"</Typography>
                    </Box>
                )}
            </List>
        </Box>
    </>
);