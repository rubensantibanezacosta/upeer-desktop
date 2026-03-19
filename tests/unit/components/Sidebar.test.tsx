import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Sidebar } from '../../../src/components/layout/Sidebar';

// Mock simple de Zustand para el store de navegación
const mockStore = {
    sidebarView: 'list',
    sidebarFilter: 'all',
    newChatSearch: '',
    setSidebarView: vi.fn(),
    setSidebarFilter: vi.fn(),
    setNewChatSearch: vi.fn(),
    openNewChat: vi.fn(),
    backToList: vi.fn(),
};

vi.mock('../../../src/store/useNavigationStore', () => ({
    useNavigationStore: () => mockStore
}));

// Mocking icons to avoid dependencies
vi.mock('@mui/icons-material/Groups', () => ({ default: () => <div data-testid="GroupsIcon" /> }));
vi.mock('@mui/icons-material/ChatBubbleOutline', () => ({ default: () => <div data-testid="ChatIcon" /> }));
vi.mock('@mui/icons-material/NotificationsOff', () => ({ default: () => <div data-testid="MuteIcon" /> }));
vi.mock('@mui/icons-material/StarBorder', () => ({ default: () => <div data-testid="StarIcon" /> }));
vi.mock('@mui/icons-material/PersonAdd', () => ({ default: () => <div data-testid="AddPersonIcon" /> }));
vi.mock('@mui/icons-material/GroupAdd', () => ({ default: () => <div data-testid="AddGroupIcon" /> }));
vi.mock('@mui/icons-material/ArrowBack', () => ({ default: () => <div data-testid="BackIcon" /> }));
vi.mock('@mui/icons-material/MoreVert', () => ({ default: () => <div data-testid="MoreIcon" /> }));
vi.mock('@mui/icons-material/Add', () => ({ default: () => <div data-testid="PlusIcon" /> }));
vi.mock('@mui/icons-material/Search', () => ({ default: () => <div data-testid="SearchIcon" /> }));

// Mock subcomponents to focus on Sidebar logic
vi.mock('../../../src/components/layout/SidebarHeader.js', () => ({
    SidebarHeader: ({ onAddNew }: any) => (
        <div data-testid="sidebar-header">
            <button onClick={onAddNew}>Add New</button>
        </div>
    ),
    NewChatHeader: () => <div data-testid="new-chat-header" />
}));
vi.mock('../../../src/components/layout/SidebarSearch.js', () => ({
    SidebarSearch: () => <div data-testid="sidebar-search" />
}));
vi.mock('../../../src/components/layout/ContactItem.js', () => ({
    ContactItem: ({ onSelect, contact }: any) => (
        <div data-testid={`contact-${contact.upeerId}`} onClick={() => onSelect && onSelect(contact.upeerId)}>
            {contact.name}
        </div>
    )
}));
vi.mock('../../../src/components/layout/GroupItem.js', () => ({
    GroupItem: ({ group }: any) => <div data-testid={`group-${group.id}`}>{group.name}</div>
}));
vi.mock('../../../src/components/layout/sidebar/EmptyState.js', () => ({
    EmptyState: () => <div data-testid="empty-state" />
}));
vi.mock('../../../src/components/layout/sidebar/SubViewHeader.js', () => ({
    SubViewHeader: () => <div data-testid="sub-view-header" />
}));
vi.mock('../../../src/components/layout/sidebar/AddContactForm.js', () => ({
    AddContactForm: () => <div data-testid="add-contact-form" />
}));
vi.mock('../../../src/components/layout/sidebar/CreateGroupForm.js', () => ({
    CreateGroupForm: () => <div data-testid="create-group-form" />
}));

describe('Sidebar Component', () => {
    const mockContacts = [
        { upeerId: 'c1', name: 'Alice', status: 'connected', lastMessageTime: 1000, address: 'addr1', publicKey: 'pk1' } as any,
        { upeerId: 'c2', name: 'Bob', status: 'connected', lastMessageTime: 2000, address: 'addr2', publicKey: 'pk2' } as any
    ];

    const defaultProps = {
        contacts: mockContacts,
        onSelectContact: vi.fn(),
        onDeleteContact: vi.fn(),
        onClearChat: vi.fn(),
        onAddContact: vi.fn(),
        onShowMyIdentity: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore.sidebarView = 'list';
    });

    it('renders the contact list sorted by time', () => {
        render(<Sidebar {...defaultProps} />);

        const contactEntries = screen.getAllByTestId(/contact-c/);
        expect(contactEntries[0].textContent).toBe('Bob'); // c2 has time 2000
        expect(contactEntries[1].textContent).toBe('Alice'); // c1 has time 1000
    });

    it('calls openNewChat when add button is clicked', () => {
        render(<Sidebar {...defaultProps} />);

        const addButton = screen.getByText('Add New');
        fireEvent.click(addButton);

        expect(mockStore.openNewChat).toHaveBeenCalled();
    });

    it('shows group items when groups are provided', () => {
        const groups = [{ id: 'g1', name: 'Devs', lastMessageTime: 3000, members: [] } as any];
        render(<Sidebar {...defaultProps} groups={groups} />);

        const groupElement = screen.getByTestId('group-g1');
        expect(groupElement).toBeDefined();
        expect(groupElement.textContent).toBe('Devs');
    });

    it('filters out blocked contacts', () => {
        const contactsWithBlocked = [
            ...mockContacts,
            { upeerId: 'c3', name: 'Blocked', status: 'blocked', address: 'addr3' } as any
        ];
        render(<Sidebar {...defaultProps} contacts={contactsWithBlocked} />);

        const blocked = screen.queryByText('Blocked');
        expect(blocked).toBeNull();
    });

    it('delegates contact selection', () => {
        render(<Sidebar {...defaultProps} />);

        // Get the list items only from the main list (first list)
        const items = screen.getAllByTestId(/contact-c/);
        const alice = items.find(i => i.textContent === 'Alice');

        if (!alice) throw new Error('Alice not found');

        fireEvent.click(alice);

        expect(defaultProps.onSelectContact).toHaveBeenCalledWith('c1');
    });
});
