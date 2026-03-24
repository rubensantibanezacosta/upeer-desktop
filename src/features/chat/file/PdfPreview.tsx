import React from 'react';
import { Box, Button, Typography } from '@mui/joy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface PdfPreviewProps {
    src: string;
    name: string;
    onOpenExternal?: () => void | Promise<void>;
    height?: string | number;
}

const buildPdfSrc = (src: string) => {
    if (!src) return src;
    return src.includes('#')
        ? `${src}&toolbar=0&navpanes=0&scrollbar=1`
        : `${src}#toolbar=0&navpanes=0&scrollbar=1`;
};

export const PdfPreview: React.FC<PdfPreviewProps> = ({
    src,
    name,
    onOpenExternal,
    height = '100%',
}) => (
    <Box
        sx={{
            width: '100%',
            maxWidth: 'min(100%, 980px)',
            height,
            minHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            alignItems: 'stretch',
        }}
    >
        <Box
            sx={{
                flexGrow: 1,
                borderRadius: 'lg',
                overflow: 'hidden',
                boxShadow: 'lg',
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.surface',
            }}
        >
            <Box
                component="iframe"
                title={`Vista previa de ${name}`}
                src={buildPdfSrc(src)}
                sx={{ width: '100%', height: '100%', border: 0, backgroundColor: 'background.body' }}
            />
        </Box>
        {onOpenExternal ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button variant="soft" color="neutral" startDecorator={<OpenInNewIcon />} onClick={onOpenExternal}>
                    Abrir en el sistema
                </Button>
            </Box>
        ) : null}
        <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
            {name}
        </Typography>
    </Box>
);
