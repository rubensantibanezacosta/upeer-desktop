import React from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/joy';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { QRCodeSVG } from 'qrcode.react';

interface EnrollmentCodeCardProps {
    title: string;
    description?: string;
    code: string;
    expiresAt?: number;
    showQr?: boolean;
}

const formatExpiry = (expiresAt?: number) => {
    if (!expiresAt) return null;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Caducado';
    const minutes = Math.ceil(remaining / 60000);
    return minutes === 1 ? 'Caduca en 1 minuto' : `Caduca en ${minutes} minutos`;
};

export const EnrollmentCodeCard: React.FC<EnrollmentCodeCardProps> = ({ title, description, code, expiresAt, showQr = true }) => {
    const [copied, setCopied] = React.useState(false);
    const [copyError, setCopyError] = React.useState('');
    const expiry = formatExpiry(expiresAt);

    const copy = async () => {
        try {
            const result = await window.upeer.writeClipboardText(code);
            if (!result.success) throw new Error(result.error || 'Motivo no disponible');
            setCopied(true);
            setCopyError('');
            setTimeout(() => setCopied(false), 2000);
        } catch (cause) {
            setCopied(false);
            setCopyError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    return (
        <Stack spacing={1.5}>
            <Box>
                <Typography level="title-sm">{title}</Typography>
                {description && (
                    <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>{description}</Typography>
                )}
            </Box>
            {showQr && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 1.5, backgroundColor: '#fff', borderRadius: '12px' }}>
                    <QRCodeSVG value={code} size={196} level="L" includeMargin={false} />
                </Box>
            )}
            <Box sx={{
                backgroundColor: 'background.level1',
                border: '1px solid',
                borderColor: 'divider',
                px: 1.5,
                py: 1,
                borderRadius: '10px',
            }}>
                <Typography
                    level="body-xs"
                    sx={{ fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: 96, overflowY: 'auto', lineHeight: 1.5 }}
                >
                    {code}
                </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
                <Button size="sm" variant="outlined" startDecorator={<ContentCopyIcon />} onClick={copy}>
                    {copied ? 'Copiado' : 'Copiar código'}
                </Button>
                {expiry && <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{expiry}</Typography>}
            </Stack>
            {copyError && <Alert color="danger" variant="soft" size="sm">No se pudo copiar: {copyError}</Alert>}
        </Stack>
    );
};
