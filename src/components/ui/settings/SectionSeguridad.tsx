import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    List,
    ListItem,
    Button,
    Alert,
    Input,
    Modal,
    ModalDialog,
    Stack,
    Divider,
    Chip,
} from '@mui/joy';

import ShieldIcon from '@mui/icons-material/Shield';
import KeyIcon from '@mui/icons-material/Key';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningIcon from '@mui/icons-material/Warning';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { ToggleRow } from './shared.js';
import { DeviceSessionList } from './DeviceSessionList.js';

export const SectionSeguridad: React.FC = () => {
    const [pinEnabled, setPinEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pinModalOpen, setPinModalOpen] = useState(false);
    const [pinDigits, setPinDigits] = useState(['', '', '', '']);
    const [errorMsg, setErrorMsg] = useState('');

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteDigits, setDeleteDigits] = useState(['', '', '', '']);
    const [deleteError, setDeleteError] = useState('');

    const [revealModalOpen, setRevealModalOpen] = useState(false);
    const [revealDigits, setRevealDigits] = useState(['', '', '', '']);
    const [revealError, setRevealError] = useState('');
    const [mnemonic, setMnemonic] = useState<string | null>(null);

    const pinRefs = React.useRef<(HTMLInputElement | null)[]>([]);
    const revealRefs = React.useRef<(HTMLInputElement | null)[]>([]);
    const deleteRefs = React.useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        const checkPin = async () => {
            const enabled = await window.upeer.isPinEnabled();
            setPinEnabled(enabled);
            setLoading(false);
        };
        checkPin();
    }, []);

    const handlePinToggle = async (checked: boolean) => {
        setPinDigits(['', '', '', '']);
        setErrorMsg('');
        setPinModalOpen(true);
        setTimeout(() => pinRefs.current[0]?.focus(), 100);
    };

    const handleSavePin = async (currentPin: string) => {
        if (currentPin.length < 4) {
            setErrorMsg('Introduce el PIN completo');
            return;
        }

        const res = pinEnabled
            ? await window.upeer.disablePin({ pin: currentPin })
            : await window.upeer.setPin({ newPin: currentPin });

        if (res && res.success) {
            setPinEnabled(!pinEnabled);
            setPinModalOpen(false);
            setPinDigits(['', '', '', '']);
            setErrorMsg('');
        } else {
            setErrorMsg(res?.error || 'Error al procesar el PIN');
        }
    };

    const handlePinChange = (val: string, index: number) => {
        const digit = val.replace(/\D/g, '').slice(-1);
        const newDigits = [...pinDigits];
        newDigits[index] = digit;
        setPinDigits(newDigits);

        if (digit && index < 3) {
            pinRefs.current[index + 1]?.focus();
        }

        if (newDigits.every(d => d !== '')) {
            handleSavePin(newDigits.join(''));
        }
    };

    const handleRevealSeed = async () => {
        const isEnabled = await window.upeer.isPinEnabled();
        if (!isEnabled) {
            setRevealError('Debes habilitar un PIN de acceso primero para ver tus palabras clave.');
            setRevealModalOpen(true);
            return;
        }
        setRevealModalOpen(true);
        setRevealDigits(['', '', '', '']);
        setMnemonic(null);
        setTimeout(() => revealRefs.current[0]?.focus(), 100);
    };

    const handleConfirmReveal = async (currentPin: string) => {
        const res = await window.upeer.getMnemonic(currentPin);
        if (res.success && res.mnemonic) {
            setMnemonic(res.mnemonic);
            setRevealError('');
        } else {
            setRevealError(res.error || 'PIN incorrecto');
        }
    };

    const handleRevealChange = (val: string, index: number) => {
        const digit = val.replace(/\D/g, '').slice(-1);
        const newDigits = [...revealDigits];
        newDigits[index] = digit;
        setRevealDigits(newDigits);

        if (digit && index < 3) {
            revealRefs.current[index + 1]?.focus();
        }

        if (newDigits.every(d => d !== '')) {
            handleConfirmReveal(newDigits.join(''));
        }
    };

    const handleDeleteClick = async () => {
        const isEnabled = await window.upeer.isPinEnabled();
        if (!isEnabled) {
            // Si no hay PIN, permitimos borrar directamente tras confirmación simple (o podrías forzar uno)
            if (confirm('¿Estás SEGURO de que quieres eliminar todos tus datos? Esta acción es irreversible.')) {
                await window.upeer.deleteIdentity();
                window.location.reload();
            }
            return;
        }
        setDeleteModalOpen(true);
        setDeleteDigits(['', '', '', '']);
        setDeleteError('');
        setTimeout(() => deleteRefs.current[0]?.focus(), 100);
    };

    const handleConfirmDelete = async (currentPin: string) => {
        const isValid = await window.upeer.verifyPin({ pin: currentPin });
        if (isValid) {
            if (confirm('ÚLTIMO AVISO: Se borrarán todos los mensajes, contactos y llaves privadas. ¿Continuar?')) {
                await window.upeer.deleteIdentity();
                window.location.reload();
            } else {
                setDeleteModalOpen(false);
            }
        } else {
            setDeleteError('PIN incorrecto');
        }
    };

    const handleDeleteChange = (val: string, index: number) => {
        const digit = val.replace(/\D/g, '').slice(-1);
        const newDigits = [...deleteDigits];
        newDigits[index] = digit;
        setDeleteDigits(newDigits);

        if (digit && index < 3) {
            deleteRefs.current[index + 1]?.focus();
        }

        if (newDigits.every(d => d !== '')) {
            handleConfirmDelete(newDigits.join(''));
        }
    };

    if (loading) return null;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>

            {/* ── Seguridad de la cuenta ────────────────────────────────── */}
            <Box sx={{
                px: 2.5, py: 2.5,
                borderBottom: '1px solid', borderColor: 'divider',
                backgroundColor: 'background.surface',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <ShieldIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                        <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                            Protección de cuenta
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip
                            size="sm"
                            color={pinEnabled ? 'success' : 'warning'}
                            variant="soft"
                            startDecorator={pinEnabled ? <VerifiedUserIcon sx={{ fontSize: '12px' }} /> : <WarningIcon sx={{ fontSize: '12px' }} />}
                            sx={{ fontSize: '11px' }}
                        >
                            {pinEnabled ? 'Activada' : 'No protegida'}
                        </Chip>
                    </Box>
                </Box>

                <Alert
                    color={pinEnabled ? 'primary' : 'warning'}
                    variant="soft"
                    size="sm"
                    startDecorator={pinEnabled ? <ShieldIcon sx={{ fontSize: '18px' }} /> : <WarningIcon sx={{ fontSize: '18px' }} />}
                    sx={{ borderRadius: 'md', mb: 1.5 }}
                >
                    <Typography level="body-sm">
                        {pinEnabled
                            ? 'Tu aplicación está protegida con PIN local.'
                            : 'Activa el PIN para evitar que otros accedan a tus mensajes en este equipo.'
                        }
                    </Typography>
                </Alert>
            </Box>

            {/* ── Ajustes de PIN ─────────────────────────────────────── */}
            <List sx={{ '--ListItem-paddingY': '0px', p: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                <ToggleRow
                    label="Bloqueo con PIN"
                    desc="Pedir un PIN cada vez que abres la aplicación"
                    value={pinEnabled}
                    onChange={handlePinToggle}
                />
            </List>

            <Modal open={pinModalOpen} onClose={() => setPinModalOpen(false)}>
                <ModalDialog variant="outlined" sx={{ maxWidth: 400, borderRadius: 'md', p: 3 }}>
                    <Typography level="title-lg" startDecorator={<ShieldIcon />}>
                        {pinEnabled ? 'Deshabilitar PIN' : 'Configurar PIN'}
                    </Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={2}>
                        <Typography level="body-sm" color="neutral">
                            {pinEnabled
                                ? 'Introduce tu PIN actual para desactivar el bloqueo local.'
                                : 'Introduce un PIN de 4 dígitos para proteger el acceso local.'
                            }
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', my: 1 }}>
                            {pinDigits.map((digit, i) => (
                                <Input
                                    key={i}
                                    slotProps={{
                                        input: {
                                            ref: (el: HTMLInputElement | null) => {
                                                pinRefs.current[i] = el;
                                            },
                                            style: { textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' }
                                        }
                                    }}
                                    type="password"
                                    variant="outlined"
                                    color={errorMsg ? 'danger' : 'primary'}
                                    sx={{ width: 56, height: 64, borderRadius: 'md' }}
                                    value={digit}
                                    onChange={(e) => handlePinChange(e.target.value, i)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Backspace' && !pinDigits[i] && i > 0) {
                                            pinRefs.current[i - 1]?.focus();
                                        }
                                    }}
                                    autoComplete="off"
                                />
                            ))}
                        </Box>
                        {errorMsg && <Typography level="body-xs" color="danger" textAlign="center" sx={{ fontWeight: 600 }}>{errorMsg}</Typography>}
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                            <Button variant="plain" color="neutral" onClick={() => setPinModalOpen(false)}>Cancelar</Button>
                            <Button onClick={() => handleSavePin(pinDigits.join(''))}>
                                {pinEnabled ? 'Deshabilitar' : 'Configurar'}
                            </Button>
                        </Box>
                    </Stack>
                </ModalDialog>
            </Modal>

            {/* ── Frase Semilla ──────────────────────────────────────── */}
            <Box sx={{ px: 2.5, py: 3, backgroundColor: 'background.surface' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                    <KeyIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                        Recuperación de cuenta
                    </Typography>
                </Box>

                <Box sx={{
                    p: 2,
                    borderRadius: 'lg',
                    border: '1px solid',
                    borderColor: 'warning.outlinedBorder',
                    backgroundColor: 'warning.softBg',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5
                }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                        <WarningIcon sx={{ fontSize: '18px', color: 'warning.main', mt: 0.2, flexShrink: 0 }} />
                        <Box>
                            <Typography level="body-md" sx={{ fontWeight: 600, color: 'warning.600' }}>
                                Frase de recuperación
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'warning.500', mt: 0.5, lineHeight: 1.5 }}>
                                Estas 12 palabras son la única forma de recuperar tu cuenta si pierdes acceso a este dispositivo. NUNCA las compartas.
                            </Typography>
                        </Box>
                    </Box>
                    <Button
                        size="sm"
                        variant="solid"
                        color="warning"
                        startDecorator={<KeyIcon sx={{ fontSize: '16px' }} />}
                        onClick={handleRevealSeed}
                        sx={{ alignSelf: 'flex-start', mt: 1, px: 2 }}
                    >
                        Revelar mis palabras clave
                    </Button>
                </Box>
            </Box>

            <Modal open={revealModalOpen} onClose={() => { setRevealModalOpen(false); setMnemonic(null); setRevealError(''); }}>
                <ModalDialog variant="outlined" sx={{ maxWidth: 450, borderRadius: 'md', p: 3 }}>
                    <Typography level="title-lg" startDecorator={<KeyIcon />}>Tus Palabras Clave</Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={2}>
                        {!mnemonic ? (
                            <>
                                <Typography level="body-sm" color="neutral">
                                    Por tu seguridad, introduce tu PIN para revelar la frase semilla.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', my: 1 }}>
                                    {revealDigits.map((digit, i) => (
                                        <Input
                                            key={i}
                                            slotProps={{
                                                input: {
                                                    ref: (el: HTMLInputElement | null) => {
                                                        revealRefs.current[i] = el;
                                                    },
                                                    style: { textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' }
                                                }
                                            }}
                                            type="password"
                                            variant="outlined"
                                            color={revealError ? 'danger' : 'primary'}
                                            sx={{ width: 56, height: 64, borderRadius: 'md' }}
                                            value={digit}
                                            onChange={(e) => handleRevealChange(e.target.value, i)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Backspace' && !revealDigits[i] && i > 0) {
                                                    revealRefs.current[i - 1]?.focus();
                                                }
                                            }}
                                            autoComplete="off"
                                        />
                                    ))}
                                </Box>
                                {revealError && <Typography level="body-xs" color="danger" textAlign="center" sx={{ fontWeight: 600 }}>{revealError}</Typography>}
                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                                    <Button variant="plain" color="neutral" onClick={() => setRevealModalOpen(false)}>Cancelar</Button>
                                    <Button color="warning" onClick={() => handleConfirmReveal(revealDigits.join(''))}>Revelar frases</Button>
                                </Box>
                            </>
                        ) : (
                            <>
                                <Alert color="warning" variant="solid" sx={{ alignItems: 'flex-start' }} startDecorator={<WarningIcon />}>
                                    Anota estas palabras en papel y guárdalas en un lugar secreto.
                                </Alert>
                                <Box sx={{
                                    p: 2.5,
                                    bgcolor: 'background.level1',
                                    borderRadius: 'lg',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: 2,
                                    my: 1
                                }}>
                                    {mnemonic.split(' ').map((word, i) => (
                                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography level="body-xs" sx={{ opacity: 0.35, fontWeight: 700, width: 14 }}>{i + 1}</Typography>
                                            <Typography level="body-sm" sx={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.02em' }}>
                                                {word}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                    <Button variant="solid" color="primary" size="md" onClick={() => { setRevealModalOpen(false); setMnemonic(null); }}>
                                        He guardado las frases
                                    </Button>
                                </Box>
                            </>
                        )}
                    </Stack>
                </ModalDialog>
            </Modal>

            <Divider />
            <DeviceSessionList />

            {/* ── Borrado de cuenta ──────────────────────────────────── */}
            <Box sx={{ px: 2.5, py: 3, backgroundColor: 'background.surface', borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                    <DeleteForeverIcon sx={{ fontSize: '15px', color: 'danger.500' }} />
                    <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'danger.500' }}>
                        Zona de peligro
                    </Typography>
                </Box>
                <Typography level="body-sm" color="neutral" sx={{ mb: 2, lineHeight: 1.5 }}>
                    Elimina todos tus mensajes, contactos e identidad de este equipo de forma permanente.
                </Typography>
                <Button
                    size="sm"
                    color="danger"
                    variant="soft"
                    startDecorator={<DeleteForeverIcon sx={{ fontSize: '16px' }} />}
                    sx={{ fontWeight: 600 }}
                    onClick={handleDeleteClick}
                >
                    Eliminar cuenta y datos locales
                </Button>
            </Box>

            <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
                <ModalDialog variant="outlined" sx={{ maxWidth: 400, borderRadius: 'md', p: 3 }}>
                    <Typography level="title-lg" startDecorator={<DeleteForeverIcon color="error" />}>
                        Confirmar eliminación
                    </Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={2}>
                        <Alert color="danger" variant="soft" startDecorator={<WarningIcon />}>
                            Introduce tu PIN para confirmar que quieres BORRAR TODA LA INFORMACIÓN de este dispositivo.
                        </Alert>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', my: 1 }}>
                            {deleteDigits.map((digit, i) => (
                                <Input
                                    key={i}
                                    slotProps={{
                                        input: {
                                            ref: (el: HTMLInputElement | null) => {
                                                deleteRefs.current[i] = el;
                                            },
                                            style: { textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' }
                                        }
                                    }}
                                    type="password"
                                    variant="outlined"
                                    color={deleteError ? 'danger' : 'primary'}
                                    sx={{ width: 56, height: 64, borderRadius: 'md' }}
                                    value={digit}
                                    onChange={(e) => handleDeleteChange(e.target.value, i)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Backspace' && !deleteDigits[i] && i > 0) {
                                            deleteRefs.current[i - 1]?.focus();
                                        }
                                    }}
                                    autoComplete="off"
                                />
                            ))}
                        </Box>
                        {deleteError && (
                            <Typography level="body-xs" color="danger" textAlign="center" sx={{ fontWeight: 600 }}>
                                {deleteError}
                            </Typography>
                        )}
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                            <Button variant="plain" color="neutral" onClick={() => setDeleteModalOpen(false)}>
                                Cancelar
                            </Button>
                            <Button color="danger" onClick={() => handleConfirmDelete(deleteDigits.join(''))}>
                                Eliminar TODO
                            </Button>
                        </Box>
                    </Stack>
                </ModalDialog>
            </Modal>
        </Box>
    );
};

