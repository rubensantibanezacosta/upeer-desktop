import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // @mui/icons-material@7 importa createSvgIcon desde @mui/material/utils,
            // pero este proyecto usa @mui/joy. Redirigimos al shim local compatible.
            '@mui/material/utils': path.resolve(__dirname, 'src/mui-material-utils-shim.ts'),
        },
    },
});
