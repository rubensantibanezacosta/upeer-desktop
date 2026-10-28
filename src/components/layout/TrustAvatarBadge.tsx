import React from 'react';
import { Badge, Box, Tooltip } from '@mui/joy';
import { ShieldAlert } from 'lucide-react';
import { getReputationWarning } from '../../utils/reputationWarning.js';

interface TrustAvatarBadgeProps {
    vouchScore?: number;
    children: React.ReactNode;
}

export const TrustAvatarBadge: React.FC<TrustAvatarBadgeProps> = ({ vouchScore, children }) => {
    const warning = getReputationWarning(vouchScore);
    if (!warning) {
        return <>{children}</>;
    }

    return (
        <Badge
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            badgeContent={
                <Tooltip title={warning.label} variant="solid" size="sm" placement="top">
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <ShieldAlert style={{ fontSize: 12, color: 'var(--joy-palette-danger-600)' }} />
                    </Box>
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
