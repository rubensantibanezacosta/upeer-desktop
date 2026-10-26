import React from 'react';
import { Box } from '@mui/joy';
import { InfoRow, sectionCardSx, sectionGroupSx } from './shared.js';

export const SectionAcerca: React.FC = () => (
    <Box sx={sectionGroupSx}>
        <Box sx={sectionCardSx}>
            <InfoRow label="Versión" value="1.0.0" />
            <InfoRow label="Licencia" value="GPLv3" />
            <InfoRow label="Código abierto" value="Sí" />
            <InfoRow label="Publicidad" value="Ninguna" />
            <InfoRow label="Datos recopilados" value="Ninguno" />
        </Box>
    </Box>
);
