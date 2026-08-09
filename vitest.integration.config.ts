import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/integration/**/*.integration.test.ts'],
        setupFiles: ['./tests/setup-test-mocks.js'],
        testTimeout: 30000,
    },
});
