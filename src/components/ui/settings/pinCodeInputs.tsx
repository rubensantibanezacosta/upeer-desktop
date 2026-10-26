import React from 'react';
import { Box, Input } from '@mui/joy';

interface PinCodeInputsProps {
    digits: string[];
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
    color: 'danger' | 'primary';
    onChange: (value: string, index: number) => void;
}

export const PinCodeInputs: React.FC<PinCodeInputsProps> = ({ digits, refs, color, onChange }) => (
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
