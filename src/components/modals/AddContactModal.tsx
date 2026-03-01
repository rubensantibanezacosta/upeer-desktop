import React, { useState } from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    Stack,
    FormControl,
    FormLabel,
    Input,
    Button,
    Typography,
    Alert,
    Box,
    IconButton,
    Divider
} from '@mui/joy';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';

interface AddContactModalProps {
    open: boolean;
    onClose: () => void;
    onAdd: (id: string, name: string) => void;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({ open, onClose, onAdd }) => {
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!id.includes('@')) {
            setError('Formato inválido. Usa: RevelNestID@IP');
            return;
        }

        const [revelnestId, ip] = id.split('@');
        if (!revelnestId || !ip) {
            setError('Formato incompleto. Asegúrate de incluir el ID y la IP.');
            return;
        }

        if (id && name) {
            onAdd(id, name);
            setId('');
            setName('');
            setError('');
            onClose();
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ width: 450, maxWidth: '95vw', borderRadius: 'xl', boxShadow: 'lg', p: 0, overflow: 'hidden' }}>
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAddIcon color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Nueva Conexión Segura</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ p: 3 }}>
                    <Typography level="body-sm" sx={{ mb: 2.5 }}>
                        Para añadir a alguien, necesitas su <b>Identidad RevelNest</b> completa (ID@IP). Este formato garantiza que conectas de forma segura y directa.
                    </Typography>

                    {error && (
                        <Alert
                            variant="soft"
                            color="danger"
                            startDecorator={<InfoOutlined />}
                            sx={{ mb: 2.5, py: 1 }}
                        >
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <Stack spacing={2.5}>
                            <FormControl required>
                                <FormLabel sx={{ fontWeight: 600 }}>Identidad RevelNest (ID@IP)</FormLabel>
                                <Input
                                    autoFocus
                                    placeholder="fc33aa0e...@200:..."
                                    value={id}
                                    onChange={(e) => {
                                        setId(e.target.value);
                                        if (error) setError('');
                                    }}
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                        backgroundColor: 'background.level1',
                                        '&:focus-within': {
                                            backgroundColor: 'background.surface'
                                        }
                                    }}
                                />
                                <Typography level="body-xs" sx={{ mt: 0.5, opacity: 0.7 }}>
                                    Ejemplo: bdc2...48b3@200:155d:b29a...
                                </Typography>
                            </FormControl>

                            <FormControl required>
                                <FormLabel sx={{ fontWeight: 600 }}>Alias del Contacto</FormLabel>
                                <Input
                                    placeholder="Nombre o apodo para identificarlo"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    sx={{
                                        backgroundColor: 'background.level1',
                                        '&:focus-within': {
                                            backgroundColor: 'background.surface'
                                        }
                                    }}
                                />
                            </FormControl>

                            <Button
                                type="submit"
                                variant="solid"
                                color="primary"
                                size="lg"
                                fullWidth
                                sx={{ mt: 1, borderRadius: 'md', fontWeight: 600 }}
                            >
                                Emparejar y Conectar
                            </Button>
                        </Stack>
                    </form>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
