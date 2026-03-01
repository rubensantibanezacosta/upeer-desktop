import React from 'react';
import { Box, List, Divider } from '@mui/joy';
import { SidebarHeader } from './SidebarHeader.js';
import { SidebarSearch } from './SidebarSearch.js';
import { ContactItem } from './ContactItem.js';

interface Contact {
    revelnestId: string;
    address: string;
    name: string;
    status: 'pending' | 'incoming' | 'connected';
    lastSeen?: string;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageIsMine?: boolean;
    lastMessageStatus?: string;
}

interface SidebarProps {
    contacts: Contact[];
    onSelectContact: (id: string) => void;
    onDeleteContact: (id: string) => void;
    selectedId?: string;
    typingStatus?: Record<string, any>;
    onAddNew: () => void;
    onShowMyIdentity: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    contacts,
    onSelectContact,
    onDeleteContact,
    selectedId,
    onAddNew,
    onShowMyIdentity,
    typingStatus = {}
}) => (
    <Box sx={{
        width: 400,
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.surface'
    }}>
        <SidebarHeader onShowMyIdentity={onShowMyIdentity} onAddNew={onAddNew} />
        <SidebarSearch />
        <Divider />
        <Box sx={{ flexGrow: 1, overflowY: 'auto', backgroundColor: 'background.surface' }}>
            <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                {contacts.map((c, i) => (
                    <ContactItem
                        key={c.revelnestId || i}
                        contact={c}
                        isSelected={selectedId === c.revelnestId}
                        onSelect={onSelectContact}
                        onDelete={onDeleteContact}
                        isTyping={!!typingStatus[c.revelnestId]}
                    />
                ))}
            </List>
        </Box>
    </Box>
);
