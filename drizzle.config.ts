import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/main_process/storage/schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: 'dummy', // Not needed for generation
    },
});
