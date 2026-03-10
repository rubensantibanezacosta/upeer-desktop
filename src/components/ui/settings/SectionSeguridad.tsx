import React, { useState } from 'react';
import {
    Box,
    Typography,
    List,
    ListItem,
    Button,
    Alert,
} from '@mui/joy';

import ShieldIcon from '@mui/icons-material/Shield';
import KeyIcon from '@mui/icons-material/Key';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningIcon from '@mui/icons-material/Warning';

import { ToggleRow } from './shared.js';

export const SectionSeguridad: React.FC = () => {
    const [pinEnabled, setPinEnabled] = useState(false);

    return (
        <Box>
            <Box sx={{ px: 1.5, py: 1.5 }}>
                <Alert color="primary" variant="soft" size="sm" startDecorator={<ShieldIcon sx={{ fontSize: '18px' }} />}>
                    <Typography level="body-sm">
                        Solo quien tenga tus 12 palabras clave puede acceder a tu cuenta.
                    </Typography>
                </Alert>
            </Box>

            <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                <ToggleRow
                    label="Bloqueo con PIN"
                    desc="Pedir un PIN cada vez que abres la aplicación"
                    value={pinEnabled}
                    onChange={setPinEnabled}
                />
                {pinEnabled && (
                    <ListItem sx={{ p: 0 }}>
                        <Box sx={{ px: 1.5, py: 1 }}>
                            <Button size="sm" variant="outlined" color="neutral" startDecorator={<KeyIcon sx={{ fontSize: '16px' }} />}>
                                Cambiar PIN
                            </Button>
                        </Box>
                    </ListItem>
                )}
            </List>

            <Box sx={{ px: 1.5, py: 1.5, backgroundColor: 'warning.softBg', borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <WarningIcon sx={{ fontSize: '18px', color: 'warning.500', mt: 0.2, flexShrink: 0 }} />
                    <Box>
                        <Typography level="body-md" sx={{ fontWeight: 500 }}>Guarda tus palabras clave</Typography>
                        <Typography level="body-sm" color="neutral" sx={{ mt: 0.25 }}>
                            Si cambias de dispositivo o lo pierdes, las necesitarás para recuperar tu cuenta.
                        </Typography>
                        <Button size="sm" variant="plain" color="warning" sx={{ mt: 1, px: 0 }} startDecorator={<KeyIcon sx={{ fontSize: '16px' }} />}>
                            Ver mis palabras clave
                        </Button>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ px: 1.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography level="body-sm" color="neutral" sx={{ mb: 1 }}>
                    Elimina todos tus mensajes y contactos de este dispositivo. Esta acción no se puede deshacer.
                </Typography>
                <Button size="sm" color="danger" variant="soft" startDecorator={<DeleteForeverIcon sx={{ fontSize: '16px' }} />}>
                    Eliminar cuenta y datos
                </Button>
            </Box>
        </Box>
    );
};
