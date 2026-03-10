import { create } from 'zustand';
import { SettingsSection } from '../components/ui/settings/types.js';

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
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useNavigationStore = create<NavigationState & NavigationActions>((set, get) => ({
    // Estado inicial
    appView: 'chat',
    settingsSection: null,
    sidebarView: 'list',
    sidebarFilter: 'all',
    newChatSearch: '',

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
}));
