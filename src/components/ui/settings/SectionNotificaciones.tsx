import React from 'react';
import { List } from '@mui/joy';
import { ToggleRow } from './shared.js';
import { useNotificationStore } from '../../../store/useNotificationStore.js';

export const SectionNotificaciones: React.FC = () => {
    const { msgNotif, reqNotif, sound, setMsgNotif, setReqNotif, setSound } = useNotificationStore();

    return (
        <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
            <ToggleRow
                label="Nuevos mensajes"
                desc="Avisar cuando recibes un mensaje"
                value={msgNotif}
                onChange={setMsgNotif}
            />
            <ToggleRow
                label="Solicitudes de contacto"
                desc="Avisar cuando alguien quiere contactarte"
                value={reqNotif}
                onChange={setReqNotif}
            />
            <ToggleRow
                label="Sonidos"
                desc="Reproducir sonidos de notificación"
                value={sound}
                onChange={setSound}
            />
        </List>
    );
};
