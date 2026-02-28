import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: 'src/preload.ts',
            formats: ['cjs'],
        },
        rollupOptions: {
            external: ['electron'],
            output: {
                entryFileNames: 'preload.cjs',
            },
        },
    },
});
