import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    Stack,
    Alert,
    CircularProgress,
    Textarea,
    IconButton,
    LinearProgress,
    Chip,
} from '@mui/joy';

import ShieldIcon from '@mui/icons-material/Shield';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockIcon from '@mui/icons-material/Lock';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

type Screen = 'home' | 'create-explain' | 'create-generate' | 'create-confirm' | 'import' | 'switch-warn';

interface LoginScreenProps {
    onUnlocked: () => void;
}

// ── Word chip (ocultable) ─────────────────────────────────────────────────────

const WordChip: React.FC<{ index: number; word: string; reveal: boolean }> = ({ index, word, reveal }) => (
    <Box
        sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            borderRadius: 'md',
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.level1',
            userSelect: reveal ? 'text' : 'none',
            filter: reveal ? 'none' : 'blur(5px)',
            transition: 'filter 0.3s ease',
            minWidth: '100px',
        }}
    >
        <Typography level="body-xs" sx={{ opacity: 0.45, minWidth: 18, fontFamily: 'monospace' }}>
            {index + 1}.
        </Typography>
        <Typography level="body-sm" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {word}
        </Typography>
    </Box>
);

// ── Pantalla de inicio ────────────────────────────────────────────────────────

const HomeScreen: React.FC<{
    isLocked: boolean;
    onCreateNew: () => void;
    onImport: () => void;
    onUnlock: () => void;
    onSwitchAccount: () => void;
}> = ({ isLocked, onCreateNew, onImport, onUnlock, onSwitchAccount }) => (
    <Stack spacing={4} alignItems="center" sx={{ maxWidth: 380, width: '100%' }}>
        {/* Logo */}
        <Box sx={{
            width: 80, height: 80,
            backgroundColor: 'background.level1',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'xl',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <ShieldIcon sx={{ fontSize: 40, color: 'primary.500' }} />
        </Box>

        <Box sx={{ textAlign: 'center' }}>
            <Typography level="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                upeer
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Mensajería directa, sin intermediarios
            </Typography>
        </Box>

        {isLocked ? (
            <Stack spacing={2} sx={{ width: '100%' }}>
                <Alert
                    variant="soft"
                    color="warning"
                    startDecorator={<LockIcon />}
                    sx={{ borderRadius: 'lg' }}
                >
                    <Typography level="body-sm">
                        Tu cuenta está protegida. Introduce tus palabras clave para entrar.
                    </Typography>
                </Alert>
                <Button
                    fullWidth
                    size="lg"
                    startDecorator={<LockOpenIcon />}
                    onClick={onUnlock}
                    sx={{ borderRadius: 'md', fontWeight: 600 }}
                >
                    Entrar a mi cuenta
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    color="neutral"
                    size="lg"
                    startDecorator={<AddIcon />}
                    onClick={onSwitchAccount}
                    sx={{ borderRadius: 'md', fontWeight: 600 }}
                >
                    Crear cuenta nueva
                </Button>
                <Button
                    fullWidth
                    variant="plain"
                    color="neutral"
                    size="lg"
                    startDecorator={<DownloadIcon />}
                    onClick={onSwitchAccount}
                    sx={{ borderRadius: 'md', fontWeight: 600 }}
                >
                    Usar otra cuenta existente
                </Button>
            </Stack>
        ) : (
            <Stack spacing={2} sx={{ width: '100%' }}>
                <Button
                    fullWidth
                    size="lg"
                    startDecorator={<AddIcon />}
                    onClick={onCreateNew}
                    sx={{ borderRadius: 'md', fontWeight: 600 }}
                >
                    Crear cuenta nueva
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    color="neutral"
                    size="lg"
                    startDecorator={<DownloadIcon />}
                    onClick={onImport}
                    sx={{ borderRadius: 'md', fontWeight: 600 }}
                >
                    Ya tengo una cuenta
                </Button>

            </Stack>
        )}
    </Stack>
);

// ── Aviso: cambiar de cuenta en dispositivo con cuenta activa ──────────────────

const SwitchAccountWarnScreen: React.FC<{
    onBack: () => void;
    onContinueCreate: () => void;
    onContinueImport: () => void;
    currentId?: string;
}> = ({ onBack, onContinueCreate, onContinueImport, currentId }) => (
    <Stack spacing={3} sx={{ maxWidth: 420, width: '100%' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton variant="plain" color="neutral" size="sm" onClick={onBack}>
                <ArrowBackIcon />
            </IconButton>
            <Typography level="h4" sx={{ fontWeight: 700 }}>Usar una cuenta diferente</Typography>
        </Stack>

        <Alert
            variant="soft"
            color="warning"
            startDecorator={<WarningAmberIcon />}
        >
            <Stack spacing={0.5}>
                <Typography level="title-sm" color="warning">La sesión actual se borrará de este dispositivo</Typography>
                <Typography level="body-sm">
                    La cuenta {currentId ? `que termina en ...${currentId.slice(-8)}` : 'actual'} dejará de estar guardada aquí.
                    Su propietario podrá recuperarla en cualquier momento usando sus 12 palabras clave.
                </Typography>
            </Stack>
        </Alert>

        <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 'md', backgroundColor: 'background.level1' }}>
            <Typography level="body-md" sx={{ fontWeight: 500, mb: 0.5 }}>Qué pasará al continuar</Typography>
            <Stack spacing={0.5}>
                <Typography level="body-sm" color="neutral">— La sesión actual se eliminará de este dispositivo</Typography>
                <Typography level="body-sm" color="neutral">— Podrás crear una cuenta nueva o entrar con tus propias palabras</Typography>
                <Typography level="body-sm" color="neutral">— El anterior usuario puede volver cuando quiera con sus palabras</Typography>
            </Stack>
        </Box>

        <Stack spacing={1.5}>
            <Button
                fullWidth
                size="lg"
                color="warning"
                startDecorator={<AddIcon />}
                onClick={onContinueCreate}
                sx={{ borderRadius: 'md', fontWeight: 600 }}
            >
                Crear cuenta nueva
            </Button>
            <Button
                fullWidth
                size="lg"
                variant="outlined"
                color="warning"
                startDecorator={<DownloadIcon />}
                onClick={onContinueImport}
                sx={{ borderRadius: 'md', fontWeight: 600 }}
            >
                Recuperar mi cuenta con mis palabras
            </Button>
            <Button
                fullWidth
                size="lg"
                variant="plain"
                color="neutral"
                onClick={onBack}
                sx={{ borderRadius: 'md', fontWeight: 600 }}
            >
                Cancelar
            </Button>
        </Stack>
    </Stack>
);


const CreateExplainScreen: React.FC<{
    onBack: () => void;
    onGenerate: () => void;
    isLoading: boolean;
}> = ({ onBack, onGenerate, isLoading }) => (
    <Stack spacing={3} sx={{ maxWidth: 420, width: '100%' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton variant="plain" color="neutral" size="sm" onClick={onBack}>
                <ArrowBackIcon />
            </IconButton>
            <Typography level="h4" sx={{ fontWeight: 700 }}>Como funciona tu cuenta</Typography>
        </Stack>

        <Stack spacing={2}>
            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 'md', backgroundColor: 'background.level1' }}>
                <Typography level="body-md" sx={{ fontWeight: 500, mb: 0.5 }}>Sin servidores ni bases de datos</Typography>
                <Typography level="body-sm" color="neutral">
                    upeer no tiene un servidor central. Nadie guarda tu cuenta, tu contrasena ni tus mensajes. Todo funciona directamente entre dispositivos.
                </Typography>
            </Box>

            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 'md', backgroundColor: 'background.level1' }}>
                <Typography level="body-md" sx={{ fontWeight: 500, mb: 0.5 }}>12 palabras = tu cuenta</Typography>
                <Typography level="body-sm" color="neutral">
                    Como no hay servidor, tu cuenta no es un correo ni una contrasena. Son 12 palabras unicas que la generan. Las mismas palabras en cualquier dispositivo dan acceso a la misma cuenta.
                </Typography>
            </Box>

            <Box sx={{ p: 2, border: '1px solid', borderColor: 'warning.outlinedBorder', borderRadius: 'md', backgroundColor: 'warning.softBg' }}>
                <Typography level="body-md" sx={{ fontWeight: 500, mb: 0.5, color: 'warning.700' }}>Si las pierdes, no hay recuperacion</Typography>
                <Typography level="body-sm" color="neutral">
                    No hay nadie a quien llamar ni correo de recuperacion. Si pierdes tus 12 palabras, pierdes acceso a tu cuenta para siempre. Guardalas bien.
                </Typography>
            </Box>
        </Stack>

        <Button
            fullWidth
            size="lg"
            loading={isLoading}
            onClick={onGenerate}
            sx={{ borderRadius: 'md', fontWeight: 600 }}
        >
            Entendido, generar mis palabras
        </Button>
    </Stack>
);

// ── Pantalla: Tus palabras clave ──────────────────────────────────────────────

const CreateGenerateScreen: React.FC<{
    mnemonic: string[];
    onRegenerate: () => void;
    onBack: () => void;
    onConfirm: () => void;
}> = ({ mnemonic, onRegenerate, onBack, onConfirm }) => {
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(mnemonic.join(' '));
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 500, width: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton variant="plain" color="neutral" size="sm" onClick={onBack}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="h4" sx={{ fontWeight: 700 }}>Tus palabras clave</Typography>
            </Stack>

            <Alert
                variant="soft"
                color="warning"
                startDecorator={<WarningAmberIcon />}
                sx={{ borderRadius: 'lg' }}
            >
                <Stack spacing={0.5}>
                    <Typography level="title-sm" color="warning">Guárdalas en un lugar seguro</Typography>
                    <Typography level="body-xs">
                        Estas 12 palabras son la única forma de acceder a tu cuenta en cualquier dispositivo. Anótalas en papel o guárdalas en un lugar privado.
                    </Typography>
                </Stack>
            </Alert>

            {/* Grid de palabras */}
            <Box sx={{ position: 'relative' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                    {mnemonic.map((word, i) => (
                        <WordChip key={i} index={i} word={word} reveal={revealed} />
                    ))}
                </Box>

                {!revealed && (
                    <Box sx={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(1px)',
                    }}>
                        <Button
                            variant="soft"
                            startDecorator={<VisibilityIcon />}
                            onClick={() => setRevealed(true)}
                            sx={{ borderRadius: 'lg', boxShadow: 'md' }}
                        >
                            Mostrar mis palabras
                        </Button>
                    </Box>
                )}
            </Box>

            {revealed && (
                <Stack direction="row" spacing={1}>
                    <Button
                        variant="outlined"
                        color={copied ? 'success' : 'neutral'}
                        size="sm"
                        startDecorator={copied ? <CheckIcon /> : <ContentCopyIcon />}
                        onClick={copy}
                        sx={{ borderRadius: 'md', flex: 1 }}
                    >
                        {copied ? 'Copiadas' : 'Copiar palabras'}
                    </Button>
                    <Button
                        variant="outlined"
                        color="neutral"
                        size="sm"
                        startDecorator={<RefreshIcon />}
                        onClick={onRegenerate}
                        sx={{ borderRadius: 'md' }}
                    >
                        Sugerir otras
                    </Button>
                </Stack>
            )}

            <Button
                fullWidth
                size="lg"
                disabled={!revealed}
                onClick={onConfirm}
                sx={{ borderRadius: 'md', fontWeight: 600 }}
            >
                Ya las guardé, continuar
            </Button>
        </Stack>
    );
};

// ── Helper: redimensionar imagen a base64 128x128 en canvas ────────────────────────

const resizeImageToDataUrl = (file: File, size = 128): Promise<string> =>
    new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(''); // Fallback silencioso
                // Centrar y recortar en cuadrado
                const scale = Math.max(size / img.width, size / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    });

// ── Pantalla: Confirmar palabras ──────────────────────────────────────────────

const CreateConfirmScreen: React.FC<{
    mnemonic: string[];
    onBack: () => void;
    onConfirmed: (mnemonic: string, alias: string, avatar: string) => void;
    isLoading: boolean;
    error: string | null;
}> = ({ mnemonic, onBack, onConfirmed, isLoading, error }) => {
    const [input, setInput] = useState('');
    const [alias, setAlias] = useState('');
    const [avatar, setAvatar] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const isValid = words.length === 12 && mnemonic.every((w, i) => w === words[i]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const dataUrl = await resizeImageToDataUrl(file);
        setAvatar(dataUrl);
        e.target.value = ''; // allow re-selecting same file
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 500, width: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton variant="plain" color="neutral" size="sm" onClick={onBack} disabled={isLoading}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="h4" sx={{ fontWeight: 700 }}>Confirmar palabras</Typography>
            </Stack>

            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Escribe las 12 palabras en el mismo orden para confirmar que las has guardado.
            </Typography>

            <Textarea
                minRows={3}
                maxRows={5}
                placeholder="palabra1 palabra2 palabra3 … palabra12"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isLoading}
                sx={{
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    borderRadius: 'md',
                    ...(input.length > 0 && {
                        '--Textarea-focusedHighlight': isValid
                            ? 'var(--joy-palette-success-500)'
                            : (words.length === 12 ? 'var(--joy-palette-danger-500)' : undefined)
                    })
                }}
            />

            {words.length === 12 && !isValid && (
                <Alert color="danger" variant="soft" size="sm" sx={{ borderRadius: 'md' }}>
                    Las palabras no coinciden. Comprueba el orden.
                </Alert>
            )}

            {error && (
                <Alert color="danger" variant="soft" size="sm" sx={{ borderRadius: 'md' }}>
                    {error}
                </Alert>
            )}

            {isLoading && (
                <Box>
                    <Typography level="body-xs" sx={{ mb: 1, color: 'text.secondary' }}>Configurando tu cuenta…</Typography>
                    <LinearProgress sx={{ borderRadius: 'sm' }} />
                </Box>
            )}

            {/* Avatar + Alias en fila */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                {/* Avatar circular */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Box
                        onClick={() => !isLoading && fileInputRef.current?.click()}
                        sx={{
                            width: 72, height: 72, borderRadius: 'lg',
                            border: '2px dashed',
                            borderColor: avatar ? 'primary.400' : 'divider',
                            overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: isLoading ? 'default' : 'pointer',
                            backgroundColor: 'background.level2',
                            transition: 'border-color 0.2s',
                            '&:hover': { borderColor: isLoading ? undefined : 'primary.500' },
                        }}
                    >
                        {avatar
                            ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <CameraAltIcon sx={{ fontSize: 28, color: 'text.tertiary' }} />
                        }
                    </Box>
                    {avatar && (
                        <Button
                            size="sm" variant="plain" color="danger"
                            onClick={() => setAvatar('')} disabled={isLoading}
                            sx={{ fontSize: '11px', py: 0, minHeight: 'auto' }}
                        >
                            Quitar
                        </Button>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleAvatarChange}
                    />
                </Box>

                {/* Nombre / alias */}
                <Box sx={{ flex: 1 }}>
                    <Typography level="body-xs" sx={{ mb: 0.5, fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Tu nombre en la red (opcional)
                    </Typography>
                    <input
                        placeholder="Cómo quieres que te vean tus contactos"
                        value={alias}
                        onChange={e => setAlias(e.target.value)}
                        maxLength={64}
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--joy-palette-divider)',
                            background: 'var(--joy-palette-background-level1)',
                            color: 'var(--joy-palette-text-primary)',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                        Toca el círculo para añadir foto de perfil.
                    </Typography>
                </Box>
            </Box>

            <Button
                fullWidth
                size="lg"
                disabled={!isValid || isLoading}
                loading={isLoading}
                onClick={() => onConfirmed(mnemonic.join(' '), alias.trim(), avatar)}
                sx={{ borderRadius: 'md', fontWeight: 600 }}
                color="primary"
            >
                Crear mi cuenta
            </Button>
        </Stack>
    );
};

// ── Pantalla: Importar / Desbloquear ─────────────────────────────────────────

const ImportScreen: React.FC<{
    mode: 'import' | 'unlock';
    onBack: () => void;
    onSubmit: (mnemonic: string) => void;
    isLoading: boolean;
    error: string | null;
}> = ({ mode, onBack, onSubmit, isLoading, error }) => {
    const [input, setInput] = useState('');
    const [showWords, setShowWords] = useState(false);
    const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const isValid = words.length === 12;

    const title = mode === 'unlock' ? 'Entrar a mi cuenta' : 'Recuperar mi cuenta';
    const description = mode === 'unlock'
        ? 'Escribe tus 12 palabras clave para acceder a tu cuenta.'
        : 'Escribe tus 12 palabras clave para recuperar tu cuenta en este dispositivo.';

    return (
        <Stack spacing={3} sx={{ maxWidth: 450, width: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton variant="plain" color="neutral" size="sm" onClick={onBack} disabled={isLoading}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="h4" sx={{ fontWeight: 700 }}>{title}</Typography>
            </Stack>

            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                {description}
            </Typography>

            <Box sx={{ position: 'relative' }}>
                <Textarea
                    minRows={3}
                    maxRows={5}
                    placeholder="palabra1 palabra2 … palabra12"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onFocus={() => setShowWords(true)}
                    disabled={isLoading}
                    sx={{
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        borderRadius: 'md',
                        pr: 5,
                    }}
                />
                <IconButton
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={() => setShowWords(v => !v)}
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                >
                    {showWords ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {words.length} de 12 palabras
                </Typography>
                {isValid && (
                    <Chip size="sm" color="success" variant="soft" startDecorator={<CheckIcon />}>
                        Listo
                    </Chip>
                )}
            </Box>

            {error && (
                <Alert color="danger" variant="soft" size="sm" sx={{ borderRadius: 'md' }}>
                    {error}
                </Alert>
            )}

            {isLoading && (
                <Box>
                    <Typography level="body-xs" sx={{ mb: 1, color: 'text.secondary' }}>Configurando tu cuenta…</Typography>
                    <LinearProgress sx={{ borderRadius: 'sm' }} />
                </Box>
            )}

            <Button
                fullWidth
                size="lg"
                disabled={!isValid || isLoading}
                loading={isLoading}
                onClick={() => onSubmit(input.trim().toLowerCase())}
                startDecorator={<LockOpenIcon />}
                sx={{ borderRadius: 'md', fontWeight: 600 }}
            >
                {title}
            </Button>
        </Stack>
    );
};

// ── Componente raíz ───────────────────────────────────────────────────────────

export const LoginScreen: React.FC<LoginScreenProps> = ({ onUnlocked }) => {
    const [screen, setScreen] = useState<Screen>('home');
    const [isLocked, setIsLocked] = useState(false);
    const [mnemonic, setMnemonic] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(() => {
        window.upeer.identityStatus().then((status: any) => {
            if (!status.isLocked) {
                // Session already active (auto-restored on startup, or legacy mode):
                // enter the app directly without asking anything.
                onUnlocked();
                return;
            }
            setIsLocked(status.isMnemonicMode); // true = has an identity but locked
            setInitializing(false);
        }).catch(() => {
            setInitializing(false);
        });
    }, [onUnlocked]);

    const handleGenerateMnemonic = async () => {
        const result = await window.upeer.generateMnemonic();
        setMnemonic(result.mnemonic.split(' '));
        setScreen('create-generate');
    };

    // Clear the current session before switching to a different account.
    const handleSwitchAndNavigate = async (destination: 'create-explain' | 'import') => {
        try { await window.upeer.lockSession(); } catch (_) { /* ignore */ }
        setIsLocked(false); // now no identity is active on this device
        setScreen(destination);
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
        } catch (e: any) {
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
        } catch (e: any) {
            setError('Algo fue mal. Inténtalo de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    if (initializing) {
        return (
            <Box sx={{
                height: '100vh', width: '100vw',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'background.body',
            }}>
                <CircularProgress size="md" />
            </Box>
        );
    }

    return (
        <Box sx={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'background.body',
            px: 2,
        }}>
            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                {screen === 'home' && (
                    <HomeScreen
                        isLocked={isLocked}
                        onCreateNew={() => setScreen('create-explain')}
                        onImport={() => setScreen('import')}
                        onUnlock={() => setScreen('import')}
                        onSwitchAccount={() => setScreen('switch-warn')}
                    />
                )}

                {screen === 'switch-warn' && (
                    <SwitchAccountWarnScreen
                        onBack={() => setScreen('home')}
                        onContinueCreate={() => handleSwitchAndNavigate('create-explain')}
                        onContinueImport={() => handleSwitchAndNavigate('import')}
                        currentId={undefined}
                    />
                )}

                {screen === 'create-explain' && (
                    <CreateExplainScreen
                        onBack={() => setScreen('home')}
                        onGenerate={handleGenerateMnemonic}
                        isLoading={false}
                    />
                )}

                {screen === 'create-generate' && (
                    <CreateGenerateScreen
                        mnemonic={mnemonic}
                        onRegenerate={handleGenerateMnemonic}
                        onBack={() => setScreen('home')}
                        onConfirm={() => setScreen('create-confirm')}
                    />
                )}

                {screen === 'create-confirm' && (
                    <CreateConfirmScreen
                        mnemonic={mnemonic}
                        onBack={() => setScreen('create-generate')}
                        onConfirmed={handleCreateConfirm}
                        isLoading={isLoading}
                        error={error}
                    />
                )}

                {screen === 'import' && (
                    <ImportScreen
                        mode={isLocked ? 'unlock' : 'import'}
                        onBack={() => setScreen('home')}
                        onSubmit={handleImportOrUnlock}
                        isLoading={isLoading}
                        error={error}
                    />
                )}
            </Box>

            <Typography level="body-xs" sx={{ position: 'absolute', bottom: 20, color: 'text.tertiary' }}>
                uPeer · v1.0.0
            </Typography>
        </Box>
    );
};
