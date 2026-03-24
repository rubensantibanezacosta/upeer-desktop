export interface Identity {
    address: string | null;
    upeerId: string;
    publicKey: string;
    alias?: string | null;
    avatar?: string | null;
}

export interface SettingsPanelProps {
    identity: Identity | null;
    networkAddress: string;
    networkStatus: string;
    activeSection: SettingsSection | null;
    onSectionChange: (section: SettingsSection | null) => void;
    onClose?: () => void;
    onLockSession?: () => void;
    onIdentityUpdate?: () => void;
}

export type SettingsSection =
    | 'perfil'
    | 'privacidad'
    | 'notificaciones'
    | 'apariencia'
    | 'almacenamiento'
    | 'seguridad'
    | 'red'
    | 'acerca';
