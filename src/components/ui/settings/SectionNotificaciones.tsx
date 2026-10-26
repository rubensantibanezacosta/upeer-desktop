import React from 'react';
import { List } from '@mui/joy';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { ToggleRow } from './shared.js';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useNotificationStore } from '../../../store/useNotificationStore.js';

export const SectionNotificaciones: React.FC = () => {
    const { msgNotif, reqNotif, sound, setMsgNotif, setReqNotif, setSound } = useNotificationStore();

    return (
        <SettingsSection
            icon={<NotificationsIcon />}
            title="Notificaciones"
            description="Elige qué avisos quieres recibir mientras la aplicación está abierta."
        >
            <SettingsCard>
                <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                    <ToggleRow
                        icon={<NotificationsActiveIcon />}
                        label="Nuevos mensajes"
                        desc="Avisar cuando recibes un mensaje"
                        value={msgNotif}
                        onChange={setMsgNotif}
                    />
                    <ToggleRow
                        icon={<PersonAddAlt1Icon />}
                        label="Solicitudes de contacto"
                        desc="Avisar cuando alguien quiere contactarte"
                        value={reqNotif}
                        onChange={setReqNotif}
                    />
                    <ToggleRow
                        icon={<VolumeUpIcon />}
                        label="Sonidos"
                        desc="Reproducir sonidos de notificación"
                        value={sound}
                        onChange={setSound}
                    />
                </List>
            </SettingsCard>
        </SettingsSection>
    );
};
