import React, { useState, useEffect } from 'react';
import {
    List,
    Divider,
    Box,
} from '@mui/joy';

import { ToggleRow } from './shared.js';
import { DeviceSessionList } from './DeviceSessionList.js';
import { DeleteAccountModal, RevealMnemonicModal, SecurityPinModal } from './securityDialogs.js';
import { DangerZoneSection, RecoverySection, SecurityStatusCard } from './securitySections.js';

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

    const handlePinToggle = async (_checked: boolean) => {
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
            <SecurityStatusCard pinEnabled={pinEnabled} />

            <List sx={{ '--ListItem-paddingY': '0px', p: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                <ToggleRow
                    label="Bloqueo con PIN"
                    desc="Pedir un PIN cada vez que abres la aplicación"
                    value={pinEnabled}
                    onChange={handlePinToggle}
                />
            </List>

            <SecurityPinModal
                open={pinModalOpen}
                pinEnabled={pinEnabled}
                digits={pinDigits}
                errorMsg={errorMsg}
                refs={pinRefs}
                onClose={() => setPinModalOpen(false)}
                onChange={handlePinChange}
                onSubmit={() => handleSavePin(pinDigits.join(''))}
            />

            <RecoverySection onRevealSeed={handleRevealSeed} />

            <RevealMnemonicModal
                open={revealModalOpen}
                digits={revealDigits}
                errorMsg={revealError}
                mnemonic={mnemonic}
                refs={revealRefs}
                onClose={() => {
                    setRevealModalOpen(false);
                    setMnemonic(null);
                    setRevealError('');
                }}
                onChange={handleRevealChange}
                onReveal={() => handleConfirmReveal(revealDigits.join(''))}
                onConfirmSaved={() => {
                    setRevealModalOpen(false);
                    setMnemonic(null);
                }}
            />

            <Divider />
            <DeviceSessionList />

            <DangerZoneSection onDeleteClick={handleDeleteClick} />

            <DeleteAccountModal
                open={deleteModalOpen}
                digits={deleteDigits}
                errorMsg={deleteError}
                refs={deleteRefs}
                onClose={() => setDeleteModalOpen(false)}
                onChange={handleDeleteChange}
                onSubmit={() => handleConfirmDelete(deleteDigits.join(''))}
            />
        </Box>
    );
};

