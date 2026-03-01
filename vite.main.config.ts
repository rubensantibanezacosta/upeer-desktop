import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        lib: {
            entry: 'src/main.ts',
            formats: ['es'],
            fileName: 'main',
        },
        rollupOptions: {
            external: ['electron', 'node:os', 'node:path', 'node:dgram', 'node:fs', 'node:crypto', 'node:child_process', 'node:url', 'electron-squirrel-startup', 'better-sqlite3', 'sodium-native', '@vscode/sudo-prompt'],
        },
    },
});
