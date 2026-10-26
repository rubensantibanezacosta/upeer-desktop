import { extendTheme } from '@mui/joy/styles';

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
    },
});
