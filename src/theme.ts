import { extendTheme } from '@mui/joy/styles';
import { INPUT_PILL_RADIUS } from './inputShape.js';

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
