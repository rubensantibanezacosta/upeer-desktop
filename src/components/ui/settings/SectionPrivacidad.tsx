import React from 'react';
import { List } from '@mui/joy';
import { ToggleRow } from './shared.js';
import { usePrivacyStore } from '../../../store/usePrivacyStore.js';

export const SectionPrivacidad: React.FC = () => {
    const readReceipts = usePrivacyStore((s) => s.readReceipts);
    const onlineStatus = usePrivacyStore((s) => s.onlineStatus);
    const lastSeen = usePrivacyStore((s) => s.lastSeen);
    const setReadReceipts = usePrivacyStore((s) => s.setReadReceipts);
    const setOnlineStatus = usePrivacyStore((s) => s.setOnlineStatus);
    const setLastSeen = usePrivacyStore((s) => s.setLastSeen);

    return (
        <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
            <ToggleRow
                label="Confirmaciones de lectura"
                desc="Enviar y recibir ticks azules"
                value={readReceipts}
                onChange={setReadReceipts}
            />
            <ToggleRow
                label="Mostrar cuando estoy conectado"
                desc="Que tus contactos vean si estas disponible"
                value={onlineStatus}
                onChange={setOnlineStatus}
            />
            <ToggleRow
                label="Última vez visto"
                desc="Mostrar tu ultima actividad a tus contactos"
                value={lastSeen}
                onChange={setLastSeen}
            />
        </List>
    );
};
