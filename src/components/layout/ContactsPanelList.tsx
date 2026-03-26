import React from 'react';
import {
    Avatar,
    Box,
    Chip,
    List,
    ListItem,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Typography,
} from '@mui/joy';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import { SidebarSearch } from './SidebarSearch.js';
import type { Contact } from '../../types/chat.js';

type ContactsPanelFilter = 'all' | 'blocked';

interface ContactsPanelListProps {
    visibleContacts: Contact[];
    activeContact: Contact | null;
    filter: ContactsPanelFilter;
    searchQuery: string;
    onSearchChange: (value: string) => void;
    onFilterChange: (value: ContactsPanelFilter) => void;
    onSelectContact: (upeerId: string) => void;
}

const getContactMetaLabel = (contact: Contact) => {
    switch (contact.status) {
        case 'blocked':
            return { label: 'Bloqueado', color: 'danger.400' };
        case 'incoming':
            return { label: 'Solicitud recibida', color: 'primary.400' };
        case 'pending':
            return { label: 'Pendiente', color: 'warning.400' };
        default:
            return null;
    }
};

export const ContactsPanelList: React.FC<ContactsPanelListProps> = ({
    visibleContacts,
    activeContact,
    filter,
    searchQuery,
    onSearchChange,
    onFilterChange,
    onSelectContact,
}) => (
    <Box
        sx={{
            width: 400,
            minWidth: 400,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'background.surface',
        }}
    >
        <Box sx={{ px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', boxSizing: 'border-box' }}>
            <Typography level="h4" sx={{ fontWeight: 600 }}>Contactos</Typography>
            <Chip size="sm" variant="soft" color="neutral">{visibleContacts.length}</Chip>
        </Box>
        <SidebarSearch
            value={searchQuery}
            onChange={onSearchChange}
            activeFilter={filter}
            onFilterChange={(value) => onFilterChange(value as ContactsPanelFilter)}
            placeholder="Buscar contactos"
            filters={[
                { label: 'Activos', value: 'all' },
                { label: 'Bloqueados', value: 'blocked' },
            ]}
        />
        <List sx={{ '--ListItem-paddingY': '0px', p: 1, overflowY: 'auto', flexGrow: 1 }}>
            {visibleContacts.length === 0 ? (
                <Box sx={{ px: 3, py: 8, textAlign: 'center', color: 'text.tertiary' }}>
                    <PersonOffIcon sx={{ fontSize: 48, opacity: 0.35, mb: 1 }} />
                    <Typography level="body-sm" color="neutral">
                        {filter === 'blocked' ? 'No hay contactos bloqueados' : 'No hay contactos guardados'}
                    </Typography>
                </Box>
            ) : visibleContacts.map((contact) => {
                const metaLabel = getContactMetaLabel(contact);
                return (
                    <ListItem key={contact.upeerId} sx={{ p: 0, mb: 0.5 }}>
                        <ListItemButton
                            selected={activeContact?.upeerId === contact.upeerId}
                            onClick={() => onSelectContact(contact.upeerId)}
                            sx={{
                                minHeight: '76px',
                                px: 1.5,
                                borderRadius: '10px',
                                margin: 0,
                                transition: 'background-color 0.15s ease, border-color 0.15s ease',
                                '&:hover': { backgroundColor: 'background.level1' },
                                '&.Mui-selected': { backgroundColor: 'background.level1' },
                                '&.Mui-selected:hover': { backgroundColor: 'background.level1' },
                            }}
                        >
                            <ListItemDecorator sx={{ mr: 2 }}>
                                <Avatar src={contact.avatar || undefined} size="lg" variant="soft" sx={{ borderRadius: 'md' }}>
                                    {(contact.name || contact.upeerId).charAt(0).toUpperCase()}
                                </Avatar>
                            </ListItemDecorator>
                            <ListItemContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                    <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                                        {contact.name}
                                    </Typography>
                                    {metaLabel ? (
                                        <Typography level="body-xs" sx={{ color: metaLabel.color, flexShrink: 0 }}>
                                            {metaLabel.label}
                                        </Typography>
                                    ) : null}
                                </Box>
                                <Typography level="body-sm" color="neutral" noWrap sx={{ opacity: 0.72 }}>
                                    {contact.alias || contact.upeerId}
                                </Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>
                );
            })}
        </List>
    </Box>
);