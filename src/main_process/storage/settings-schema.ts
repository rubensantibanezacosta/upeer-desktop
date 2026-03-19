import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Tabla para configuraciones locales de la aplicación
 * No se sincroniza con otros dispositivos por defecto.
 */
export const appSettings = sqliteTable('app_settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON stringified
    updatedAt: integer('updated_at').notNull()
});
