import React from 'react';
import { Box, Button, Typography } from '@mui/joy';
import VisibilityIcon from '@mui/icons-material/Visibility';

interface WordChipProps {
    index: number;
    word: string;
    reveal: boolean;
}

const WordChip: React.FC<WordChipProps> = ({ index, word, reveal }) => (
    <Box
        sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            minWidth: 0,
            px: 1.25,
            py: 1,
            borderRadius: '14px',
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.level1',
            userSelect: reveal ? 'text' : 'none',
            filter: reveal ? 'none' : 'blur(6px)',
            transition: 'filter 0.2s ease',
        }}
    >
        <Typography level="body-xs" sx={{ fontFamily: 'monospace', color: 'text.tertiary', minWidth: 20 }}>
            {index + 1}.
        </Typography>
        <Typography level="body-sm" sx={{ fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {word}
        </Typography>
    </Box>
);

interface CreateFlowMnemonicPanelProps {
    mnemonic: string[];
    revealed: boolean;
    onReveal: () => void;
}

export const CreateFlowMnemonicPanel: React.FC<CreateFlowMnemonicPanelProps> = ({ mnemonic, revealed, onReveal }) => (
    <Box sx={{ position: 'relative' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
            {mnemonic.map((word, index) => (
                <WordChip key={`${word}-${index}`} index={index} word={word} reveal={revealed} />
            ))}
        </Box>
        {!revealed && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', backdropFilter: 'blur(2px)' }}>
                <Button variant="soft" startDecorator={<VisibilityIcon />} onClick={onReveal} sx={{ borderRadius: '999px', px: 2.5 }}>
                    Mostrar palabras
                </Button>
            </Box>
        )}
    </Box>
);