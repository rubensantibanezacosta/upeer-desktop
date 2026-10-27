import React from 'react';
import { List } from '@mui/joy';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { ToggleRow } from './shared.js';
import { Bell, BellRing, UserPlus, Volume2 } from 'lucide-react';
import { useNotificationStore } from '../../../store/useNotificationStore.js';
import { pushNotificationPrefs } from '../../../store/notificationSync.js';

export const SectionNotificaciones: React.FC = () => {
    const { msgNotif, reqNotif, sound, setMsgNotif, setReqNotif, setSound } = useNotificationStore();

    const changeMessages = (value: boolean) => {
        setMsgNotif(value);
        pushNotificationPrefs({ messages: value });
    };
    const changeRequests = (value: boolean) => {
        setReqNotif(value);
        pushNotificationPrefs({ requests: value });
    };
    const changeSound = (value: boolean) => {
        setSound(value);
        pushNotificationPrefs({ sound: value });
    };

    return (
        <SettingsSection
            icon={<Bell style={{ fontSize: 18 }} />}
            title="Notificaciones"
            description="Elige qué avisos quieres recibir mientras la aplicación está abierta."
        >
            <SettingsCard>
                <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                    <ToggleRow
                        icon={<BellRing />}
                        label="Nuevos mensajes"
                        desc="Avisar cuando recibes un mensaje"
                        value={msgNotif}
                        onChange={changeMessages}
                    />
                    <ToggleRow
                        icon={<UserPlus />}
                        label="Solicitudes de contacto"
                        desc="Avisar cuando alguien quiere contactarte"
                        value={reqNotif}
                        onChange={changeRequests}
                    />
                    <ToggleRow
                        icon={<Volume2 />}
                        label="Sonidos"
                        desc="Reproducir sonidos de notificación"
                        value={sound}
                        onChange={changeSound}
                    />
                </List>
            </SettingsCard>
        </SettingsSection>
    );
};
