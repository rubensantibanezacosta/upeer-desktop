import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { iconsStubPlugin } from './vitest.icons-stub.js';

export default defineConfig({
    plugins: [iconsStubPlugin()],
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['tests/unit/**/*.test.{ts,tsx}'],
        setupFiles: ['./tests/setup-test-mocks.js'],
        alias: [
            { find: /^@mui\/material$/, replacement: resolve(__dirname, './src/mui-material-utils-shim.ts') },
            { find: /^@mui\/material\/(.*)$/, replacement: resolve(__dirname, './src/mui-material-utils-shim.ts') }
        ],
        server: {
            deps: {
                inline: [/@mui\/joy/]
            }
        }
    },
});
