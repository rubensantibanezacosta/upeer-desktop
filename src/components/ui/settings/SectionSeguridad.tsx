import React, { useState, useEffect } from 'react';
import { List } from '@mui/joy';
import { Shield, KeyRound } from 'lucide-react';

import { ToggleRow } from './shared.js';
import { SettingsCard, SettingsSection } from './sectionShell.js';
import { RevealMnemonicModal, SecurityPinModal } from './securityDialogs.js';
import { RecoverySection, SecurityStatusCard } from './securitySections.js';

export const SectionSeguridad: React.FC = () => {
    const [pinEnabled, setPinEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pinModalOpen, setPinModalOpen] = useState(false);
    const [pinDigits, setPinDigits] = useState(['', '', '', '']);
    const [errorMsg, setErrorMsg] = useState('');

    const [revealModalOpen, setRevealModalOpen] = useState(false);
    const [revealDigits, setRevealDigits] = useState(['', '', '', '']);
    const [revealError, setRevealError] = useState('');
    const [mnemonic, setMnemonic] = useState<string | null>(null);

    const pinRefs = React.useRef<(HTMLInputElement | null)[]>([]);
    const revealRefs = React.useRef<(HTMLInputElement | null)[]>([]);

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

    if (loading) return null;

    return (
        <SettingsSection
            icon={<Shield style={{ fontSize: 18 }} />}
            title="Seguridad"
            description="Protege este equipo con un PIN y guarda a mano las palabras que recuperan tu cuenta."
        >
            <SettingsCard>
                <SecurityStatusCard pinEnabled={pinEnabled} />
                <List sx={{ '--ListItem-paddingY': '0px', p: 0.5 }}>
                    <ToggleRow
                        icon={<KeyRound />}
                        label="Bloqueo con PIN"
                        desc="Pedir un PIN cada vez que abres la aplicación"
                        value={pinEnabled}
                        onChange={handlePinToggle}
                    />
                </List>
            </SettingsCard>

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

            <SettingsCard>
                <RecoverySection onRevealSeed={handleRevealSeed} />
            </SettingsCard>

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
        </SettingsSection>
    );
};

