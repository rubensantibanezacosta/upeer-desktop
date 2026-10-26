import React from 'react';
import { List } from '@mui/joy';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { ToggleRow } from './shared.js';
import LockIcon from '@mui/icons-material/Lock';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CircleIcon from '@mui/icons-material/Circle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { usePrivacyStore } from '../../../store/usePrivacyStore.js';

export const SectionPrivacidad: React.FC = () => {
    const readReceipts = usePrivacyStore((s) => s.readReceipts);
    const onlineStatus = usePrivacyStore((s) => s.onlineStatus);
    const lastSeen = usePrivacyStore((s) => s.lastSeen);
    const setReadReceipts = usePrivacyStore((s) => s.setReadReceipts);
    const setOnlineStatus = usePrivacyStore((s) => s.setOnlineStatus);
    const setLastSeen = usePrivacyStore((s) => s.setLastSeen);

    return (
        <SettingsSection
            icon={<LockIcon />}
            title="Privacidad"
            description="Controla qué información comparten tus contactos sobre tu actividad."
        >
            <SettingsCard>
                <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                    <ToggleRow
                        icon={<DoneAllIcon />}
                        label="Confirmaciones de lectura"
                        desc="Enviar y recibir ticks azules"
                        value={readReceipts}
                        onChange={setReadReceipts}
                    />
                    <ToggleRow
                        icon={<CircleIcon sx={{ fontSize: '12px' }} />}
                        label="Mostrar cuando estoy conectado"
                        desc="Que tus contactos vean si estás disponible"
                        value={onlineStatus}
                        onChange={setOnlineStatus}
                    />
                    <ToggleRow
                        icon={<ScheduleIcon />}
                        label="Última vez visto"
                        desc="Mostrar tu última actividad a tus contactos"
                        value={lastSeen}
                        onChange={setLastSeen}
                    />
                </List>
            </SettingsCard>
        </SettingsSection>
    );
};
