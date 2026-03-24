import React, { useEffect, useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/joy';
import { CreateConfirmStep, CreateExplainStep, CreateGenerateStep } from './login/CreateFlow.js';
import { HomeStep, SwitchAccountWarnStep } from './login/HomeStep.js';
import { ImportStep } from './login/ImportStep.js';
import { LoginShell } from './login/LoginShell.js';
import type { Screen } from './login/types.js';

interface LoginScreenProps {
    onUnlocked: () => void;
}

const getShellCopy = (screen: Screen, isLocked: boolean) => {
    if (screen === 'create-explain') {
        return {
            stepLabel: 'Paso 1 de 3',
            title: 'Crea una cuenta solo tuya',
            description: 'Antes de generarla, asegúrate de entender cómo funciona la recuperación y qué papel juegan tus 12 palabras.'
        };
    }

    if (screen === 'create-generate') {
        return {
            stepLabel: 'Paso 2 de 3',
            title: 'Guarda tu frase secreta',
            description: 'Esta frase es la única forma de restaurar tu identidad exacta más adelante.'
        };
    }

    if (screen === 'create-confirm') {
        return {
            stepLabel: 'Paso 3 de 3',
            title: 'Confirma y entra',
            description: 'Verifica la frase y personaliza tu perfil inicial antes de crear la cuenta.'
        };
    }

    if (screen === 'import') {
        return {
            stepLabel: isLocked ? 'Acceso seguro' : 'Recuperación',
            title: isLocked ? 'Desbloquea tu sesión' : 'Recupera tu cuenta',
            description: isLocked
                ? 'Tu identidad sigue en este dispositivo, pero está protegida hasta que introduzcas tus 12 palabras.'
                : 'Introduce tu frase secreta para reconstruir la misma identidad en este dispositivo.'
        };
    }

    if (screen === 'switch-warn') {
        return {
            stepLabel: 'Cambio de cuenta',
            title: 'Cambia de identidad en este dispositivo',
            description: 'Antes de continuar, confirma que quieres cerrar la sesión local actual y empezar con otra cuenta.'
        };
    }

    return {
        stepLabel: isLocked ? 'Sesión protegida' : 'Bienvenida',
        title: isLocked ? 'Tu cuenta te está esperando' : 'Entra en tu red P2P',
        description: isLocked
            ? 'Desbloquea la identidad guardada en este dispositivo o cámbiala por otra cuenta.'
            : 'Crea una cuenta nueva o recupera una existente para empezar a usar upeer.'
    };
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ onUnlocked }) => {
    const [screen, setScreen] = useState<Screen>('home');
    const [isLocked, setIsLocked] = useState(false);
    const [mnemonic, setMnemonic] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(() => {
        window.upeer.identityStatus()
            .then((status: any) => {
                if (!status.isLocked) {
                    onUnlocked();
                    return;
                }
                setIsLocked(status.isMnemonicMode);
                setInitializing(false);
            })
            .catch(() => {
                setInitializing(false);
            });
    }, [onUnlocked]);

    const shellCopy = useMemo(() => getShellCopy(screen, isLocked), [screen, isLocked]);

    const handleGenerateMnemonic = async () => {
        const result = await window.upeer.generateMnemonic();
        setMnemonic(result.mnemonic.split(' '));
        setError(null);
        setScreen('create-generate');
    };

    const handleSwitchAndNavigate = async (destination: 'create-explain' | 'import') => {
        try {
            await window.upeer.lockSession();
            setIsLocked(false);
            setError(null);
            setScreen(destination);
        } catch {
            setError('No se pudo cerrar la sesión local actual. Inténtalo de nuevo.');
            setScreen('home');
        }
    };

    const handleImportOrUnlock = async (phrase: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = isLocked
                ? await window.upeer.unlockSession(phrase)
                : await window.upeer.createMnemonicIdentity(phrase);

            if (result.success) {
                onUnlocked();
            } else {
                setError('Las palabras no son correctas. Comprueba que estén completas y en orden.');
            }
        } catch {
            setError('Algo fue mal. Inténtalo de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateConfirm = async (phrase: string, alias: string, avatar: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await window.upeer.createMnemonicIdentity(phrase, alias, avatar);
            if (result.success) {
                onUnlocked();
            } else {
                setError('No se pudo crear la cuenta. Inténtalo de nuevo.');
            }
        } catch {
            setError('Algo fue mal. Inténtalo de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    if (initializing) {
        return (
            <Box sx={{ height: '100vh', width: '100vw', display: 'grid', placeItems: 'center', backgroundColor: 'background.body' }}>
                <CircularProgress size="md" />
            </Box>
        );
    }

    return (
        <LoginShell title={shellCopy.title} description={shellCopy.description} stepLabel={shellCopy.stepLabel}>
            {screen === 'home' && (
                <HomeStep
                    isLocked={isLocked}
                    onCreateNew={() => setScreen('create-explain')}
                    onImport={() => setScreen('import')}
                    onUnlock={() => setScreen('import')}
                    onSwitchAccount={() => setScreen('switch-warn')}
                />
            )}

            {screen === 'switch-warn' && (
                <SwitchAccountWarnStep
                    currentId={undefined}
                    onBack={() => setScreen('home')}
                    onContinueCreate={() => handleSwitchAndNavigate('create-explain')}
                    onContinueImport={() => handleSwitchAndNavigate('import')}
                />
            )}

            {screen === 'create-explain' && (
                <CreateExplainStep
                    onBack={() => setScreen('home')}
                    onGenerate={handleGenerateMnemonic}
                    isLoading={false}
                />
            )}

            {screen === 'create-generate' && (
                <CreateGenerateStep
                    mnemonic={mnemonic}
                    onBack={() => setScreen('create-explain')}
                    onConfirm={() => setScreen('create-confirm')}
                    onRegenerate={handleGenerateMnemonic}
                />
            )}

            {screen === 'create-confirm' && (
                <CreateConfirmStep
                    mnemonic={mnemonic}
                    onBack={() => setScreen('create-generate')}
                    onConfirmed={handleCreateConfirm}
                    isLoading={isLoading}
                    error={error}
                />
            )}

            {screen === 'import' && (
                <ImportStep
                    mode={isLocked ? 'unlock' : 'import'}
                    onBack={() => setScreen('home')}
                    onSubmit={handleImportOrUnlock}
                    isLoading={isLoading}
                    error={error}
                />
            )}
        </LoginShell>
    );
};
