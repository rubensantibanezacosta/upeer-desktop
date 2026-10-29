import React from 'react';
import { List, Typography } from '@mui/joy';
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
            description="Las confirmaciones de lectura se anuncian a tus contactos; presencia y última vez solo cambian lo que ves de ellos."
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
                Al desactivar las confirmaciones de lectura no se envía el mensaje READ: la conversación se marca como leída solo aquí.
            </Typography>
        </SettingsSection>
    );
};
