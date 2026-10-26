import React from 'react';
import { List } from '@mui/joy';
import { Info, Sparkles, Scale, Code, Megaphone, EyeOff } from 'lucide-react';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { InfoRow } from './shared.js';

export const SectionAcerca: React.FC = () => (
    <SettingsSection
        icon={<Info style={{ fontSize: 18 }} />}
        title="Acerca de uPeer"
        description="Versión instalada y el compromiso con tus datos."
    >
        <SettingsCard>
            <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                <InfoRow icon={<Sparkles />} label="Versión" value="1.0.0" />
                <InfoRow icon={<Scale />} label="Licencia" value="GPLv3" />
                <InfoRow icon={<Code />} label="Código abierto" value="Sí" />
                <InfoRow icon={<Megaphone />} label="Publicidad" value="Ninguna" />
                <InfoRow icon={<EyeOff />} label="Datos recopilados" value="Ninguno" />
            </List>
        </SettingsCard>
    </SettingsSection>
);
