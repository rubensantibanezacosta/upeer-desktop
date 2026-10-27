import React from 'react';
import { List } from '@mui/joy';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { ToggleRow } from './shared.js';
import { Lock, CheckCheck, Circle, Clock } from 'lucide-react';
import { usePrivacyStore } from '../../../store/usePrivacyStore.js';
import { pushPrivacyPrefs } from '../../../store/privacySync.js';

export const SectionPrivacidad: React.FC = () => {
    const readReceipts = usePrivacyStore((s) => s.readReceipts);
    const onlineStatus = usePrivacyStore((s) => s.onlineStatus);
    const lastSeen = usePrivacyStore((s) => s.lastSeen);
    const setReadReceipts = usePrivacyStore((s) => s.setReadReceipts);
    const setOnlineStatus = usePrivacyStore((s) => s.setOnlineStatus);
    const setLastSeen = usePrivacyStore((s) => s.setLastSeen);

    const changeReadReceipts = (value: boolean) => {
        setReadReceipts(value);
        pushPrivacyPrefs({ readReceipts: value });
    };
    const changeOnlineStatus = (value: boolean) => {
        setOnlineStatus(value);
        pushPrivacyPrefs({ onlineStatus: value });
    };
    const changeLastSeen = (value: boolean) => {
        setLastSeen(value);
        pushPrivacyPrefs({ lastSeen: value });
    };

    return (
        <SettingsSection
            icon={<Lock style={{ fontSize: 18 }} />}
            title="Privacidad"
            description="Controla qué información comparten tus contactos sobre tu actividad."
        >
            <SettingsCard>
                <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                    <ToggleRow
                        icon={<CheckCheck />}
                        label="Confirmaciones de lectura"
                        desc="Enviar y recibir ticks azules"
                        value={readReceipts}
                        onChange={changeReadReceipts}
                    />
                    <ToggleRow
                        icon={<Circle style={{ fontSize: 12 }} />}
                        label="Mostrar cuando estoy conectado"
                        desc="Que tus contactos vean si estás disponible"
                        value={onlineStatus}
                        onChange={changeOnlineStatus}
                    />
                    <ToggleRow
                        icon={<Clock />}
                        label="Última vez visto"
                        desc="Mostrar tu última actividad a tus contactos"
                        value={lastSeen}
                        onChange={changeLastSeen}
                    />
                </List>
            </SettingsCard>
        </SettingsSection>
    );
};
