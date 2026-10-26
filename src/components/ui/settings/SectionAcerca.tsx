import React from 'react';
import { List } from '@mui/joy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import GavelIcon from '@mui/icons-material/Gavel';
import CodeIcon from '@mui/icons-material/Code';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { InfoRow } from './shared.js';

export const SectionAcerca: React.FC = () => (
    <SettingsSection
        icon={<InfoOutlinedIcon />}
        title="Acerca de uPeer"
        description="Versión instalada y el compromiso con tus datos."
    >
        <SettingsCard>
            <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                <InfoRow icon={<NewReleasesIcon />} label="Versión" value="1.0.0" />
                <InfoRow icon={<GavelIcon />} label="Licencia" value="GPLv3" />
                <InfoRow icon={<CodeIcon />} label="Código abierto" value="Sí" />
                <InfoRow icon={<CampaignOutlinedIcon />} label="Publicidad" value="Ninguna" />
                <InfoRow icon={<VisibilityOffOutlinedIcon />} label="Datos recopilados" value="Ninguno" />
            </List>
        </SettingsCard>
    </SettingsSection>
);
