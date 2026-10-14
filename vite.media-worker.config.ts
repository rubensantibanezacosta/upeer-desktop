import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: '.vite/build',
        emptyOutDir: false,
        minify: true,
        lib: {
            entry: { verified_media_worker: 'src/main_process/network/server/verifiedMediaWorker.ts' },
            formats: ['cjs'],
            fileName: (_format, entryName) => `${entryName}/verifiedMediaWorker.cjs`,
        },
        rollupOptions: {
            external: [
                'electron',
                /^node:/,
                'better-sqlite3-multiple-ciphers',
                'sodium-native',
                '@journeyapps/sqlcipher',
            ],
        },
    },
});