import React, { useState } from 'react';
import { List } from '@mui/joy';
import { ToggleRow } from './shared.js';

export const SectionPrivacidad: React.FC = () => {
    const [readReceipts, setReadReceipts] = useState(true);
    const [onlineStatus, setOnlineStatus] = useState(true);
    const [lastSeen, setLastSeen] = useState(true);

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
