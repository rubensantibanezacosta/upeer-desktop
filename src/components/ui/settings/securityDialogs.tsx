import React from 'react';
import { Alert, Box, Button, Divider, Input, Modal, ModalDialog, Stack, Typography } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import KeyIcon from '@mui/icons-material/Key';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningIcon from '@mui/icons-material/Warning';

interface PinCodeInputsProps {
    digits: string[];
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
    color: 'danger' | 'primary';
    onChange: (value: string, index: number) => void;
}

const PinCodeInputs: React.FC<PinCodeInputsProps> = ({ digits, refs, color, onChange }) => (
    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', my: 1 }}>
        {digits.map((digit, index) => (
            <Input
                key={index}
                slotProps={{
                    input: {
                        ref: (element: HTMLInputElement | null) => {
                            refs.current[index] = element;
                        },
                        style: { textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' },
                    },
                }}
                type="password"
                variant="outlined"
                color={color}
                sx={{ width: 56, height: 64, borderRadius: 'md' }}
                value={digit}
                onChange={(event) => onChange(event.target.value, index)}
                onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !digits[index] && index > 0) {
                        refs.current[index - 1]?.focus();
                    }
                }}
                autoComplete="off"
            />
        ))}
    </Box>
);

interface SecurityPinModalProps {
    open: boolean;
    pinEnabled: boolean;
    digits: string[];
    errorMsg: string;
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
    onClose: () => void;
    onChange: (value: string, index: number) => void;
    onSubmit: () => void;
}

export const SecurityPinModal: React.FC<SecurityPinModalProps> = ({
    open,
    pinEnabled,
    digits,
    errorMsg,
    refs,
    onClose,
    onChange,
    onSubmit,
}) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" sx={{ maxWidth: 400, borderRadius: 'md', p: 3 }}>
            <Typography level="title-lg" startDecorator={<ShieldIcon />}>
                {pinEnabled ? 'Deshabilitar PIN' : 'Configurar PIN'}
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={2}>
                <Typography level="body-sm" color="neutral">
                    {pinEnabled
                        ? 'Introduce tu PIN actual para desactivar el bloqueo local.'
                        : 'Introduce un PIN de 4 dígitos para proteger el acceso local.'}
                </Typography>
                <PinCodeInputs digits={digits} refs={refs} color={errorMsg ? 'danger' : 'primary'} onChange={onChange} />
                {errorMsg && <Typography level="body-xs" color="danger" textAlign="center" sx={{ fontWeight: 600 }}>{errorMsg}</Typography>}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                    <Button variant="plain" color="neutral" onClick={onClose}>Cancelar</Button>
                    <Button onClick={onSubmit}>{pinEnabled ? 'Deshabilitar' : 'Configurar'}</Button>
                </Box>
            </Stack>
        </ModalDialog>
    </Modal>
);

interface RevealMnemonicModalProps {
    open: boolean;
    digits: string[];
    errorMsg: string;
    mnemonic: string | null;
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
    onClose: () => void;
    onChange: (value: string, index: number) => void;
    onReveal: () => void;
    onConfirmSaved: () => void;
}

export const RevealMnemonicModal: React.FC<RevealMnemonicModalProps> = ({
    open,
    digits,
    errorMsg,
    mnemonic,
    refs,
    onClose,
    onChange,
    onReveal,
    onConfirmSaved,
}) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" sx={{ maxWidth: 450, borderRadius: 'md', p: 3 }}>
            <Typography level="title-lg" startDecorator={<KeyIcon />}>Tus Palabras Clave</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={2}>
                {!mnemonic ? (
                    <>
                        <Typography level="body-sm" color="neutral">
                            Por tu seguridad, introduce tu PIN para revelar la frase semilla.
                        </Typography>
                        <PinCodeInputs digits={digits} refs={refs} color={errorMsg ? 'danger' : 'primary'} onChange={onChange} />
                        {errorMsg && <Typography level="body-xs" color="danger" textAlign="center" sx={{ fontWeight: 600 }}>{errorMsg}</Typography>}
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                            <Button variant="plain" color="neutral" onClick={onClose}>Cancelar</Button>
                            <Button color="warning" onClick={onReveal}>Revelar frases</Button>
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
                            my: 1,
                        }}>
                            {mnemonic.split(' ').map((word, index) => (
                                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography level="body-xs" sx={{ opacity: 0.35, fontWeight: 700, width: 14 }}>{index + 1}</Typography>
                                    <Typography level="body-sm" sx={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.02em' }}>
                                        {word}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                            <Button variant="solid" color="primary" size="md" onClick={onConfirmSaved}>He guardado las frases</Button>
                        </Box>
                    </>
                )}
            </Stack>
        </ModalDialog>
    </Modal>
);

interface DeleteAccountModalProps {
    open: boolean;
    digits: string[];
    errorMsg: string;
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
    onClose: () => void;
    onChange: (value: string, index: number) => void;
    onSubmit: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
    open,
    digits,
    errorMsg,
    refs,
    onClose,
    onChange,
    onSubmit,
}) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" sx={{ maxWidth: 400, borderRadius: 'md', p: 3 }}>
            <Typography level="title-lg" startDecorator={<DeleteForeverIcon color="error" />}>
                Confirmar eliminación
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={2}>
                <Alert color="danger" variant="soft" startDecorator={<WarningIcon />}>
                    Introduce tu PIN para confirmar que quieres BORRAR TODA LA INFORMACIÓN de este dispositivo.
                </Alert>
                <PinCodeInputs digits={digits} refs={refs} color={errorMsg ? 'danger' : 'primary'} onChange={onChange} />
                {errorMsg && <Typography level="body-xs" color="danger" textAlign="center" sx={{ fontWeight: 600 }}>{errorMsg}</Typography>}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                    <Button variant="plain" color="neutral" onClick={onClose}>Cancelar</Button>
                    <Button color="danger" onClick={onSubmit}>Eliminar TODO</Button>
                </Box>
            </Stack>
        </ModalDialog>
    </Modal>
);
