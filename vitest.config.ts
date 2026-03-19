import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['tests/unit/**/*.test.{ts,tsx}'],
        setupFiles: ['./tests/setup-test-mocks.js'],
        alias: [
            { find: /^@mui\/material$/, replacement: resolve(__dirname, './src/mui-material-utils-shim.ts') },
            { find: /^@mui\/material\/(.*)$/, replacement: resolve(__dirname, './src/mui-material-utils-shim.ts') },
            { find: /@mui\/icons-material\/esm\/utils\/createSvgIcon.js/, replacement: resolve(__dirname, './src/mui-material-utils-shim.ts') }
        ],
        server: {
            deps: {
                inline: [/@mui\/joy/, /@mui\/icons-material/]
            }
        }
    },
});
