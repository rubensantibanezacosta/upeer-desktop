import { create } from 'zustand';
import { SettingsSection } from '../components/ui/settings/types.js';
import { MediaItem } from '../types/chat.js';

// ── Tipos de vista de la sidebar ──────────────────────────────────────────────
export type SidebarView = 'list' | 'new' | 'add-contact' | 'create-group';
export type SidebarFilter = 'all' | 'unread' | 'favorites' | 'groups';
export type AppView = 'chat' | 'settings';

// ── Estado ────────────────────────────────────────────────────────────────────
interface NavigationState {
    // Vista principal
    appView: AppView;

    // Settings
    settingsSection: SettingsSection | null;

    // Sidebar
    sidebarView: SidebarView;
    sidebarFilter: SidebarFilter;
    newChatSearch: string;

    // Modals
    isAddModalOpen: boolean;
    isIdentityModalOpen: boolean;
    isShareModalOpen: boolean;
    isSecurityModalOpen: boolean;
    isCreateGroupModalOpen: boolean;

    // Overlays
    isFilePickerOpen: boolean;
    isTransfersExpanded: boolean;

    // Media Viewer
    viewerMediaList: MediaItem[];
    viewerInitialIndex: number;
}

// ── Acciones ──────────────────────────────────────────────────────────────────
interface NavigationActions {
    // Vista principal
    goToChat: () => void;
    goToSettings: (section?: SettingsSection) => void;
    toggleSettings: () => void;

    // Settings
    setSettingsSection: (section: SettingsSection | null) => void;

    // Sidebar
    setSidebarView: (view: SidebarView) => void;
    setSidebarFilter: (filter: SidebarFilter) => void;
    setNewChatSearch: (q: string) => void;
    openNewChat: () => void;           // list → new (limpia búsqueda)
    backToList: () => void;            // cualquier vista → list

    // Modal Actions
    setAddModalOpen: (open: boolean) => void;
    setIdentityModalOpen: (open: boolean) => void;
    setShareModalOpen: (open: boolean) => void;
    setSecurityModalOpen: (open: boolean) => void;
    setCreateGroupModalOpen: (open: boolean) => void;

    // Overlays
    setFilePickerOpen: (open: boolean) => void;
    setTransfersExpanded: (expanded: boolean) => void;

    // Media Viewer
    openMediaViewer: (items: MediaItem[], index: number) => void;
    closeMediaViewer: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useNavigationStore = create<NavigationState & NavigationActions>((set, get) => ({
    // Estado inicial
    appView: 'chat',
    settingsSection: null,
    sidebarView: 'list',
    sidebarFilter: 'all',
    newChatSearch: '',

    isAddModalOpen: false,
    isIdentityModalOpen: false,
    isShareModalOpen: false,
    isSecurityModalOpen: false,
    isCreateGroupModalOpen: false,

    isFilePickerOpen: false,
    isTransfersExpanded: false,

    viewerMediaList: [],
    viewerInitialIndex: 0,

    // ── Acciones vista principal
    goToChat: () => set({ appView: 'chat', sidebarView: 'list', newChatSearch: '' }),

    goToSettings: (section) => set({
        appView: 'settings',
        settingsSection: section ?? null,
        sidebarView: 'list',
        newChatSearch: '',
    }),

    toggleSettings: () => {
        const { appView } = get();
        if (appView === 'settings') {
            set({ appView: 'chat', sidebarView: 'list', newChatSearch: '' });
        } else {
            set({ appView: 'settings', settingsSection: null, sidebarView: 'list', newChatSearch: '' });
        }
    },

    // ── Acciones settings
    setSettingsSection: (section) => set({ settingsSection: section }),

    // ── Acciones sidebar
    setSidebarView: (view) => set({ sidebarView: view }),
    setSidebarFilter: (filter) => set({ sidebarFilter: filter }),
    setNewChatSearch: (q) => set({ newChatSearch: q }),

    openNewChat: () => set({ sidebarView: 'new', newChatSearch: '' }),
    backToList: () => set({ sidebarView: 'list' }),

    // ── Acciones Modals
    setAddModalOpen: (open) => set({ isAddModalOpen: open }),
    setIdentityModalOpen: (open) => set({ isIdentityModalOpen: open }),
    setShareModalOpen: (open) => set({ isShareModalOpen: open }),
    setSecurityModalOpen: (open) => set({ isSecurityModalOpen: open }),
    setCreateGroupModalOpen: (open) => set({ isCreateGroupModalOpen: open }),

    // ── Acciones Overlays
    setFilePickerOpen: (open) => set({ isFilePickerOpen: open }),
    setTransfersExpanded: (expanded) => set({ isTransfersExpanded: expanded }),

    // ── Acciones Media Viewer
    openMediaViewer: (items, index) => set({ viewerMediaList: items, viewerInitialIndex: index }),
    closeMediaViewer: () => set({ viewerMediaList: [], viewerInitialIndex: 0 }),
}));
