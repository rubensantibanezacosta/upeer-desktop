import React from 'react';
import { InfoRow } from './shared.js';

export const SectionAcerca: React.FC = () => (
    <>
        <InfoRow label="Versión" value="1.0.0" />
        <InfoRow label="Licencia" value="GPLv3" />
        <InfoRow label="Código abierto" value="Sí" />
        <InfoRow label="Publicidad" value="Ninguna" />
        <InfoRow label="Datos recopilados" value="Ninguno" />
    </>
);
