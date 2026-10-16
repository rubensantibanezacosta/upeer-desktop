import React, { useMemo, useState } from 'react';
import { Box } from '@mui/joy';
import { Contact, Group } from '../../types/chat.js';
import { useIsOnline } from '../../hooks/useIsOnline.js';
import { ContactsPanelList } from './ContactsPanelList.js';
import { ContactsPanelDetails } from './ContactsPanelDetails.js';
import { ContactsPanelDeleteDialog } from './ContactsPanelDeleteDialog.js';
import { useCall } from '../../features/call/useCall.js';
import { useCallStore } from '../../features/call/useCallStore.js';

interface ContactsPanelProps {
    contacts: Contact[];
    groups?: Group[];
    selectedContactId?: string;
    onSelectContact: (upeerId: string) => void;
    onOpenChat: (upeerId: string) => void;
    onDeleteContact: (upeerId: string) => void;
    onBlockContact: (upeerId: string) => void;
    onUnblockContact: (upeerId: string) => void;
    selfUpeerId?: string;
}

export const ContactsPanel: React.FC<ContactsPanelProps> = ({
    contacts,
    groups = [],
    selectedContactId,
    onSelectContact,
    onOpenChat,
    onDeleteContact,
    onBlockContact,
    onUnblockContact,
    selfUpeerId,
}) => {
    const [filter, setFilter] = useState<'all' | 'blocked'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const { startCall } = useCall(selfUpeerId);
    const callsUnavailable = useCallStore((state) => state.isStartingCall || Object.keys(state.calls).length > 0);

    const visibleContacts = useMemo(
        () => {
            const normalizedQuery = searchQuery.trim().toLowerCase();
            return contacts.filter(contact => {
                if (contact.isConversationOnly) return false;
                const matchesFilter = filter === 'blocked' ? contact.status === 'blocked' : contact.status !== 'blocked';
                if (!matchesFilter) return false;
                if (!normalizedQuery) return true;
                const haystack = [contact.name, contact.alias, contact.upeerId]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(normalizedQuery);
            });
        },
        [contacts, filter, searchQuery]
    );

    const activeContact = visibleContacts.find(contact => contact.upeerId === selectedContactId) || null;

    const isOnline = useIsOnline(activeContact?.lastSeen);
    const lastSeenText = activeContact && activeContact.lastSeen && !isOnline ?
        new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(activeContact.lastSeen))
        : null;

    const commonGroups = useMemo(() => {
        if (!activeContact) return [];
        return groups.filter(g => g.members.some(m => m === activeContact.upeerId));
    }, [activeContact, groups]);

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
            <ContactsPanelList
                visibleContacts={visibleContacts}
                activeContact={activeContact}
                filter={filter}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onFilterChange={setFilter}
                onSelectContact={onSelectContact}
            />

            <Box sx={{ flexGrow: 1, backgroundColor: 'background.body', overflowY: 'auto', position: 'relative' }}>
                <ContactsPanelDetails
                    activeContact={activeContact}
                    commonGroups={commonGroups}
                    isOnline={isOnline}
                    lastSeenText={lastSeenText}
                    onOpenChat={onOpenChat}
                    onBlockContact={onBlockContact}
                    onUnblockContact={onUnblockContact}
                    onDeleteRequest={setConfirmDeleteId}
                    onCallAudio={(upeerId) => { void startCall(upeerId, 'audio'); }}
                    onCallVideo={(upeerId) => { void startCall(upeerId, 'video'); }}
                    callsUnavailable={callsUnavailable}
                />
            </Box>

            <ContactsPanelDeleteDialog
                open={!!confirmDeleteId}
                activeContact={activeContact}
                onClose={() => setConfirmDeleteId(null)}
                onConfirm={() => {
                    if (confirmDeleteId) {
                        onDeleteContact(confirmDeleteId);
                    }
                    setConfirmDeleteId(null);
                }}
            />
        </Box>
    );
};
