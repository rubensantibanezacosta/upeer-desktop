import { describe, expect, it, beforeEach } from 'vitest';

describe('useNavigationStore', () => {
    let store: typeof import('../../../src/store/useNavigationStore.js').useNavigationStore;

    beforeEach(async () => {
        store = (await import('../../../src/store/useNavigationStore.js')).useNavigationStore;
        store.setState({
            appView: 'chat',
            settingsSection: null,
            sidebarView: 'list',
            sidebarFilter: 'all',
            newChatSearch: '',
            sidebarSearch: '',
            sidebarSearchFocusToken: 0,
            isAddModalOpen: false,
            isShareModalOpen: false,
            isCreateGroupModalOpen: false,
            isFilePickerOpen: false,
            isPreparingAttachments: false,
            isTransfersExpanded: false,
            viewerMediaList: [],
            viewerInitialIndex: 0,
            pendingScrollMsgId: null,
        });
    });

    it('goToChat / goToContacts / goToSettings cambian la vista', () => {
        store.getState().goToChat();
        expect(store.getState().appView).toBe('chat');

        store.getState().goToContacts();
        expect(store.getState().appView).toBe('contacts');

        store.getState().goToSettings('privacidad');
        expect(store.getState().appView).toBe('settings');
        expect(store.getState().settingsSection).toBe('privacidad');
    });

    it('toggleSettings alterna entre chat y settings', () => {
        store.getState().toggleSettings();
        expect(store.getState().appView).toBe('settings');

        store.getState().toggleSettings();
        expect(store.getState().appView).toBe('chat');
    });

    it('setSettingsSection, setSidebarView, setSidebarFilter y búsquedas actualizan estado', () => {
        store.getState().setSettingsSection('almacenamiento');
        expect(store.getState().settingsSection).toBe('almacenamiento');

        store.getState().setSidebarView('new');
        expect(store.getState().sidebarView).toBe('new');

        store.getState().setSidebarFilter('groups');
        expect(store.getState().sidebarFilter).toBe('groups');

        store.getState().setNewChatSearch('hola');
        expect(store.getState().newChatSearch).toBe('hola');

        store.getState().setSidebarSearch('x');
        expect(store.getState().sidebarSearch).toBe('x');
    });

    it('focusSidebarSearch incrementa el token y resetear', () => {
        store.getState().focusSidebarSearch();
        store.getState().focusSidebarSearch();
        expect(store.getState().sidebarSearchFocusToken).toBe(2);
    });

    it('openNewChat y backToList gestionan la vista de la sidebar', () => {
        store.getState().setNewChatSearch('busqueda');
        store.getState().openNewChat();
        expect(store.getState().sidebarView).toBe('new');

        store.getState().backToList();
        expect(store.getState().sidebarView).toBe('list');
        expect(store.getState().newChatSearch).toBe('');
    });

    it('gestiona modals y overlays', () => {
        store.getState().setAddModalOpen(true);
        store.getState().setShareModalOpen(true);
        store.getState().setCreateGroupModalOpen(true);
        store.getState().setFilePickerOpen(true);
        store.getState().setPreparingAttachments(true);
        store.getState().setTransfersExpanded(true);
        expect(store.getState().isAddModalOpen).toBe(true);
        expect(store.getState().isShareModalOpen).toBe(true);
        expect(store.getState().isCreateGroupModalOpen).toBe(true);
        expect(store.getState().isFilePickerOpen).toBe(true);
        expect(store.getState().isPreparingAttachments).toBe(true);
        expect(store.getState().isTransfersExpanded).toBe(true);
    });

    it('gestiona el media viewer y el scroll pendiente', () => {
        const items = [{ url: 'a', type: 'image' } as never];
        store.getState().openMediaViewer(items, 3);
        expect(store.getState().viewerMediaList).toEqual(items);
        expect(store.getState().viewerInitialIndex).toBe(3);

        store.getState().closeMediaViewer();
        expect(store.getState().viewerMediaList).toEqual([]);
        expect(store.getState().viewerInitialIndex).toBe(0);

        store.getState().setPendingScrollMsgId('m1');
        expect(store.getState().pendingScrollMsgId).toBe('m1');
    });
});
