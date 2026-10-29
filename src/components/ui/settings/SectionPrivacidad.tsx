import React from 'react';
import { List, Typography } from '@mui/joy';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { ToggleRow } from './shared.js';
import { Lock, CheckCheck, Circle, Clock, Activity } from 'lucide-react';
import { usePrivacyStore } from '../../../store/usePrivacyStore.js';
import { pushPrivacyPrefs } from '../../../store/privacySync.js';

export const SectionPrivacidad: React.FC = () => {
    const readReceipts = usePrivacyStore((s) => s.readReceipts);
    const onlineStatus = usePrivacyStore((s) => s.onlineStatus);
    const lastSeen = usePrivacyStore((s) => s.lastSeen);
    const shareActivity = usePrivacyStore((s) => s.shareActivity);
    const setReadReceipts = usePrivacyStore((s) => s.setReadReceipts);
    const setOnlineStatus = usePrivacyStore((s) => s.setOnlineStatus);
    const setLastSeen = usePrivacyStore((s) => s.setLastSeen);
    const setShareActivity = usePrivacyStore((s) => s.setShareActivity);

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
    const changeShareActivity = (value: boolean) => {
        setShareActivity(value);
        pushPrivacyPrefs({ shareActivity: value });
    };

    return (
        <SettingsSection
            icon={<Lock style={{ fontSize: 18 }} />}
            title="Privacidad"
            description="Las dos primeras se anuncian a tus contactos; presencia y última vez solo cambian lo que ves de ellos."
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
                        icon={<Activity />}
                        label="Compartir mi hora de actividad"
                        desc="Enviar la hora de tu última actividad a tus contactos"
                        value={shareActivity}
                        onChange={changeShareActivity}
                    />
                    <ToggleRow
                        icon={<Circle style={{ fontSize: 12 }} />}
                        label="Presencia de tus contactos"
                        desc="Ver si están en línea en la lista y en el chat"
                        value={onlineStatus}
                        onChange={changeOnlineStatus}
                    />
                    <ToggleRow
                        icon={<Clock />}
                        label="Última vez de tus contactos"
                        desc="Ver cuándo fue su última actividad"
                        value={lastSeen}
                        onChange={changeLastSeen}
                    />
                </List>
            </SettingsCard>
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Al desactivar las confirmaciones de lectura no se envía el mensaje READ: la conversación se marca como leída solo aquí. Al desactivar «Compartir mi hora de actividad» tu último latido deja de llevar la hora: lo que ya vieron tus contactos no se borra, pero deja de avanzar. El punto verde de «en línea» sigue dependiendo de que la app esté abierta, porque se deduce de cualquier paquete y no solo de ese latido.
            </Typography>
        </SettingsSection>
    );
};
