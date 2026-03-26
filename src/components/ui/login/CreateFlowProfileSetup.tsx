import React, { useRef } from 'react';
import { Box, Button, Input, Stack, Typography } from '@mui/joy';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import { resizeImageToDataUrl } from './utils.js';

interface CreateFlowProfileSetupProps {
    alias: string;
    avatar: string;
    isLoading: boolean;
    onAliasChange: (value: string) => void;
    onAvatarChange: (value: string) => void;
}

export const CreateFlowProfileSetup: React.FC<CreateFlowProfileSetupProps> = ({
    alias,
    avatar,
    isLoading,
    onAliasChange,
    onAvatarChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        try {
            const dataUrl = await resizeImageToDataUrl(file);
            onAvatarChange(dataUrl);
        } catch (error) {
            console.error('[CreateFlow] No se pudo preparar el avatar', error);
        }
        event.target.value = '';
    };

    return (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
            <Stack spacing={1} alignItems="center" sx={{ minWidth: { sm: 112 } }}>
                <Box
                    onClick={() => !isLoading && fileInputRef.current?.click()}
                    sx={{
                        width: 88,
                        height: 88,
                        borderRadius: '24px',
                        cursor: isLoading ? 'default' : 'pointer',
                        border: '1px dashed',
                        borderColor: avatar ? 'primary.500' : 'divider',
                        backgroundColor: 'background.level1',
                        overflow: 'hidden',
                        display: 'grid',
                        placeItems: 'center',
                    }}
                >
                    {avatar ? (
                        <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <AddPhotoAlternateIcon sx={{ fontSize: 30, color: 'text.tertiary' }} />
                    )}
                </Box>
                <Button
                    size="sm"
                    variant="plain"
                    color={avatar ? 'danger' : 'primary'}
                    onClick={() => (avatar ? onAvatarChange('') : fileInputRef.current?.click())}
                    disabled={isLoading}
                    sx={{ borderRadius: '999px' }}
                >
                    {avatar ? 'Quitar foto' : 'Añadir foto'}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFileChange} />
            </Stack>

            <Stack spacing={1.25} sx={{ flex: 1, width: '100%' }}>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    Elige un nombre visible para tus contactos. Puedes cambiarlo más tarde.
                </Typography>
                <Input
                    placeholder="Cómo quieres que te vean tus contactos"
                    value={alias}
                    onChange={(event) => onAliasChange(event.target.value)}
                    disabled={isLoading}
                    slotProps={{ input: { maxLength: 64 } }}
                    sx={{ minHeight: 48, borderRadius: '14px' }}
                />
            </Stack>
        </Box>
    );
};