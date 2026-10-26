import { extendTheme } from '@mui/joy/styles';
import { INPUT_PILL_RADIUS, INPUT_SIZE_HEIGHTS } from './inputShape.js';

export const appTheme = extendTheme({
    components: {
        JoyAvatar: {
            styleOverrides: {
                root: {
                    borderRadius: '50%',
                },
            },
        },
        JoyIconButton: {
            styleOverrides: {
                root: {
                    borderRadius: '50%',
                },
            },
        },
        JoyInput: {
            styleOverrides: {
                root: {
                    '--Input-radius': INPUT_PILL_RADIUS,
                    '&.MuiInput-sizeSm': { '--Input-minHeight': INPUT_SIZE_HEIGHTS.sm },
                    '&.MuiInput-sizeMd': { '--Input-minHeight': INPUT_SIZE_HEIGHTS.md },
                    '&.MuiInput-sizeLg': { '--Input-minHeight': INPUT_SIZE_HEIGHTS.lg },
                },
            },
        },
        JoyTextarea: {
            styleOverrides: {
                root: {
                    '--Textarea-radius': 'var(--joy-radius-lg)',
                },
            },
        },
    },
});
