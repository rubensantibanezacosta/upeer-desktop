import React, { useState } from 'react';
import { Box, Typography, Input, FormControl, FormLabel, Stack, Alert, Button } from '@mui/joy';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { isYggdrasilAddress } from '../../../utils/yggdrasilAddress.js';

interface AddContactFormProps {
    onAdd: (id: string, name: string) => void;
    onDone: () => void;
}

export const AddContactForm: React.FC<AddContactFormProps> = ({ onAdd, onDone }) => {
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!id.includes('@')) {
            setError('Formato inválido. Usa: UPeerID@IP');
            return;
        }
        const [upeerId, ip] = id.split('@');
        if (!upeerId || !ip) {
            setError('Formato incompleto. Incluye el ID y la IP.');
            return;
        }
        const normalizedIp = ip.trim();
        if (!isYggdrasilAddress(normalizedIp)) {
            setError('Dirección Yggdrasil inválida. Debe estar en 200::/7, incluyendo 200::/8 y 300::/8.');
            return;
        }
        if (upeerId && name) {
            onAdd(`${upeerId}@${normalizedIp}`, name.trim());
            setId(''); setName(''); setError('');
            onDone();
        }
    };

    return (
        <Box sx={{ px: 2, py: 2.5, flexGrow: 1, overflowY: 'auto' }}>
            <Typography level="body-sm" sx={{ mb: 2.5, color: 'text.secondary' }}>
                Introduce la <b>identidad upeer</b> completa de tu contacto en formato <b>ID@IP</b>.
            </Typography>
            {error && (
                <Alert
                    variant="soft" color="danger"
                    startDecorator={<InfoOutlined />}
                    sx={{ mb: 2, py: 1 }}
                >
                    {error}
                </Alert>
            )}
            <form onSubmit={handleSubmit}>
                <Stack spacing={2.5}>
                    <FormControl required>
                        <FormLabel sx={{ fontWeight: 600, fontSize: '12px' }}>Identidad upeer (ID@IP)</FormLabel>
                        <Input
                            autoFocus
                            placeholder="fc33aa0e…@200:7704:49e5:b4cd:7910:2191:2574:351b"
                            value={id}
                            onChange={(e) => { setId(e.target.value); if (error) setError(''); }}
                            sx={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: 'background.level1' }}
                        />
                        <Typography level="body-xs" sx={{ mt: 0.5, opacity: 0.6 }}>
                            Formato: UPeerID@200:... o UPeerID@300:...
                        </Typography>
                    </FormControl>
                    <FormControl required>
                        <FormLabel sx={{ fontWeight: 600, fontSize: '12px' }}>Alias del contacto</FormLabel>
                        <Input
                            placeholder="Nombre o apodo para identificarlo"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            sx={{ backgroundColor: 'background.level1' }}
                        />
                    </FormControl>
                    <Button
                        type="submit"
                        fullWidth
                        disabled={!id.trim() || !name.trim()}
                    >
                        Añadir contacto
                    </Button>
                </Stack>
            </form>
        </Box>
    );
};