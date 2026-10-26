import React, { useEffect, useRef, useState } from 'react';
import { SignOutDialog } from './securityDialogs.js';
import { resetAccountStores } from '../../../store/resetAccountStores.js';

interface SignOutFlowProps {
    open: boolean;
    onClose: () => void;
}

export const SignOutFlow: React.FC<SignOutFlowProps> = ({ open, onClose }) => {
    const [pinEnabled, setPinEnabled] = useState(false);
    const [digits, setDigits] = useState(['', '', '', '']);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (!open) return;
        setDigits(['', '', '', '']);
        setErrorMsg('');
        setLoading(false);
        let active = true;
        void window.upeer.isPinEnabled().then((enabled) => {
            if (!active) return;
            setPinEnabled(enabled);
            if (enabled) {
                setTimeout(() => pinRefs.current[0]?.focus(), 100);
            }
        });
        return () => {
            active = false;
        };
    }, [open]);

    const wipeAccount = async () => {
        setLoading(true);
        const result = await window.upeer.deleteIdentity();
        if (!result.success) {
            setErrorMsg(result.error || 'No se pudieron borrar los datos locales.');
            setLoading(false);
            return;
        }
        resetAccountStores();
        window.location.reload();
    };

    const confirmWithPin = async (pin: string) => {
        setLoading(true);
        const isValid = await window.upeer.verifyPin({ pin });
        if (!isValid) {
            setErrorMsg('PIN incorrecto');
            setDigits(['', '', '', '']);
            setLoading(false);
            pinRefs.current[0]?.focus();
            return;
        }
        await wipeAccount();
    };

    const handleSubmit = () => {
        if (loading) return;
        if (!pinEnabled) {
            void wipeAccount();
            return;
        }
        const pin = digits.join('');
        if (pin.length < 4) {
            setErrorMsg('Introduce el PIN completo');
            return;
        }
        void confirmWithPin(pin);
    };

    const handleChange = (value: string, index: number) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[index] = digit;
        setDigits(next);
        setErrorMsg('');

        if (digit && index < 3) {
            pinRefs.current[index + 1]?.focus();
        }

        if (next.every((item) => item !== '')) {
            void confirmWithPin(next.join(''));
        }
    };

    return (
        <SignOutDialog
            open={open}
            pinEnabled={pinEnabled}
            digits={digits}
            errorMsg={errorMsg}
            refs={pinRefs}
            loading={loading}
            onClose={onClose}
            onChange={handleChange}
            onSubmit={handleSubmit}
        />
    );
};
