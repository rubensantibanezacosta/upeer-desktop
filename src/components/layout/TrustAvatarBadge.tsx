import React from 'react';
import { Badge, Box, Tooltip } from '@mui/joy';
import { BadgeCheck, ShieldAlert, CircleCheck, Shield, Sparkles } from 'lucide-react';

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
        icon = <ShieldAlert style={{ fontSize: 12, color: 'var(--joy-palette-danger-600)' }} />;
        label = `Baja reputación (${vouchScore}/100) - Ten cuidado`;
    } else if (vouchScore >= 80) {
        icon = <BadgeCheck style={{ fontSize: 12, color: 'var(--joy-palette-success-600)' }} />;
        label = `Alta reputación (${vouchScore}/100) - Muy confiable`;
    } else if (vouchScore >= 65) {
        icon = <CircleCheck style={{ fontSize: 12, color: 'var(--joy-palette-primary-600)' }} />;
        label = `Buena reputación (${vouchScore}/100) - Confiable`;
    } else if (vouchScore === 50) {
        icon = <Sparkles style={{ fontSize: 12, color: 'var(--joy-palette-neutral-600)' }} />;
        label = 'Sin historial de red aún';
    } else {
        icon = <Shield style={{ fontSize: 12, color: 'var(--joy-palette-neutral-600)' }} />;
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
