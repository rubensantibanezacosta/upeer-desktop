import React from 'react';
import { Badge, Box, Tooltip } from '@mui/joy';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import NewReleasesIcon from '@mui/icons-material/NewReleases';

interface TrustAvatarBadgeProps {
    vouchScore?: number;
    children: React.ReactNode;
}

export const TrustAvatarBadge: React.FC<TrustAvatarBadgeProps> = ({ vouchScore, children }) => {
    if (vouchScore === undefined) {
        return <>{children}</>;
    }

    let icon = null;
    let label = 'Reputación estándar';

    if (vouchScore < 40) {
        icon = <GppMaybeIcon sx={{ fontSize: 12, color: 'danger.600' }} />;
        label = `Baja reputación (${vouchScore}/100) - Ten cuidado`;
    } else if (vouchScore >= 80) {
        icon = <VerifiedUserIcon sx={{ fontSize: 12, color: 'success.600' }} />;
        label = `Alta reputación (${vouchScore}/100) - Muy confiable`;
    } else if (vouchScore >= 65) {
        icon = <CheckCircleIcon sx={{ fontSize: 12, color: 'primary.600' }} />;
        label = `Buena reputación (${vouchScore}/100) - Confiable`;
    } else if (vouchScore === 50) {
        icon = <NewReleasesIcon sx={{ fontSize: 12, color: 'neutral.600' }} />;
        label = 'Sin historial de red aún';
    } else {
        icon = <SecurityIcon sx={{ fontSize: 12, color: 'neutral.600' }} />;
        label = `Reputación estándar (${vouchScore}/100)`;
    }

    return (
        <Badge
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            badgeContent={
                <Tooltip title={label} variant="solid" size="sm" placement="top">
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>{icon}</Box>
                </Tooltip>
            }
            sx={{
                '--Badge-paddingX': '0px',
                '--Badge-paddingY': '0px',
                '--Badge-ring': '2px',
                '& .MuiBadge-badge': {
                    width: 20,
                    height: 20,
                    borderRadius: 'sm',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'background.surface',
                    border: '1px solid',
                    borderColor: 'divider',
                    transform: 'translate(8%, 8%)'
                }
            }}
        >
            {children}
        </Badge>
    );
};
