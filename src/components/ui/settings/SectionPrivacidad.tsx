import React from 'react';
import { List, Typography } from '@mui/joy';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { ToggleRow } from './shared.js';
import { Lock, CheckCheck, Activity } from 'lucide-react';
import { usePrivacyStore } from '../../../store/usePrivacyStore.js';
import { pushPrivacyPrefs } from '../../../store/privacySync.js';

export const SectionPrivacidad: React.FC = () => {
    const readReceipts = usePrivacyStore((s) => s.readReceipts);
    const shareActivity = usePrivacyStore((s) => s.shareActivity);
    const setReadReceipts = usePrivacyStore((s) => s.setReadReceipts);
    const setShareActivity = usePrivacyStore((s) => s.setShareActivity);

    const changeReadReceipts = (value: boolean) => {
        setReadReceipts(value);
        pushPrivacyPrefs({ readReceipts: value });
    };
    const changeShareActivity = (value: boolean) => {
        setShareActivity(value);
        pushPrivacyPrefs({ shareActivity: value });
    };

    return (
        <SettingsSection
            icon={<Lock style={{ fontSize: 18 }} />}
            title="Privacidad"
            description="Las confirmaciones de lectura se anuncian a tus contactos. Presencia y actividad van juntas: o las compartes y las ves, o ni una cosa ni la otra."
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
                        label="Compartir mi presencia y actividad"
                        desc="Ver su presencia y su última actividad, y que ellos vean la tuya"
                        value={shareActivity}
                        onChange={changeShareActivity}
                    />
                </List>
            </SettingsCard>
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Al desactivar las confirmaciones de lectura no se envía el mensaje READ: la conversación se marca como leída solo aquí. Al desactivar «Compartir mi presencia y actividad» tu último latido deja de llevar la hora, dejas de ver la presencia y la última actividad de tus contactos, y ellos dejan de ver la tuya. El punto verde de «en línea» depende de que la app esté abierta.
            </Typography>
        </SettingsSection>
    );
};
