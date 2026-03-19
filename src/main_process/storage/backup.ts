import fs from 'node:fs';
import path from 'node:path';
import { info, warn, error } from '../security/secure-logger.js';

/**
 * Backup automático de la base de datos cifrada.
 * Realiza copia diaria y limpia backups antiguos (>7 días).
 * 
 * @param userDataPath Ruta al directorio de datos del usuario (donde está p2p-chat.db)
 * @param maxBackupsDays Número máximo de días de antigüedad para conservar backups (por defecto 7)
 * @returns Ruta al backup creado (o undefined si falló)
 */
export function performDatabaseBackup(userDataPath: string, maxBackupsDays = 7): string | undefined {
    const dbFileName = 'p2p-chat.db';
    const dbPath = path.join(userDataPath, dbFileName);

    // Verificar que la base de datos existe
    if (!fs.existsSync(dbPath)) {
        warn('Database file not found, skipping backup', { dbPath }, 'backup');
        return undefined;
    }

    // Crear nombre de backup con fecha
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const backupFileName = `p2p-chat.db.backup-${dateStr}`;
    const backupPath = path.join(userDataPath, backupFileName);

    // Verificar si ya existe un backup de hoy
    if (fs.existsSync(backupPath)) {
        info('Backup already exists for today, skipping', { backup: backupFileName }, 'backup');
        // Aún así limpiar backups antiguos
        cleanupOldBackups(userDataPath, maxBackupsDays);
        return backupPath;
    }

    try {
        // Copiar archivo de base de datos
        fs.copyFileSync(dbPath, backupPath);

        // Preservar permisos (modo 600)
        fs.chmodSync(backupPath, 0o600);

        info('Database backup created', {
            source: dbFileName,
            backup: backupFileName,
            size: fs.statSync(backupPath).size
        }, 'backup');

        // Limpiar backups antiguos
        cleanupOldBackups(userDataPath, maxBackupsDays);

        return backupPath;
    } catch (err) {
        error('Failed to create database backup', err, 'backup');
        return undefined;
    }
}

/**
 * Limpia backups antiguos basándose en la fecha en el nombre del archivo.
 * Solo elimina archivos que coincidan con el patrón `p2p-chat.db.backup-YYYY-MM-DD`.
 */
function cleanupOldBackups(userDataPath: string, maxDays: number): void {
    const backupPattern = /^p2p-chat\.db\.backup-(\d{4}-\d{2}-\d{2})$/;
    const now = Date.now();
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

    try {
        const files = fs.readdirSync(userDataPath);
        let deletedCount = 0;

        for (const file of files) {
            const match = backupPattern.exec(file);
            if (!match) continue;

            const dateStr = match[1];
            const backupDate = new Date(dateStr);

            // Verificar si la fecha es válida
            if (isNaN(backupDate.getTime())) continue;

            const ageMs = now - backupDate.getTime();

            if (ageMs > maxAgeMs) {
                const backupPath = path.join(userDataPath, file);
                try {
                    fs.unlinkSync(backupPath);
                    deletedCount++;
                    info('Old backup deleted', { file, ageDays: Math.floor(ageMs / (1000 * 60 * 60 * 24)) }, 'backup');
                } catch (err) {
                    error('Failed to delete old backup', { file, error: err }, 'backup');
                }
            }
        }

        if (deletedCount > 0) {
            info(`Cleaned up ${deletedCount} old backup(s)`, { maxDays }, 'backup');
        }
    } catch (err) {
        error('Failed to list directory for backup cleanup', err, 'backup');
    }
}

/**
 * Programa backups periódicos diarios.
 * @param userDataPath Ruta al directorio de datos del usuario
 * @param intervalHours Intervalo en horas (por defecto 24)
 * @returns Función para detener el programa de backups
 */
export function scheduleBackups(userDataPath: string, intervalHours = 24): () => void {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Realizar backup inmediato al programar (opcional)
    // performDatabaseBackup(userDataPath);

    const interval = setInterval(() => {
        performDatabaseBackup(userDataPath);
    }, intervalMs);

    info('Database backup scheduler started', { intervalHours }, 'backup');

    return () => {
        clearInterval(interval);
        info('Database backup scheduler stopped', {}, 'backup');
    };
}

/**
 * Lista los backups disponibles en el directorio de datos.
 */
export function listBackups(userDataPath: string): Array<{ name: string; path: string; size: number; modified: Date }> {
    const backupPattern = /^p2p-chat\.db\.backup-(\d{4}-\d{2}-\d{2})$/;
    const result = [];

    try {
        const files = fs.readdirSync(userDataPath);

        for (const file of files) {
            const match = backupPattern.exec(file);
            if (!match) continue;

            const backupPath = path.join(userDataPath, file);
            const stats = fs.statSync(backupPath);

            result.push({
                name: file,
                path: backupPath,
                size: stats.size,
                modified: new Date(stats.mtime)
            });
        }

        // Ordenar por fecha (más reciente primero)
        result.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    } catch (err) {
        error('Failed to list backups', err, 'backup');
    }

    return result;
}

/**
 * Restaura la base de datos desde un backup.
 * ¡ADVERTENCIA! Esto sobrescribirá la base de datos actual.
 * @param backupPath Ruta completa al archivo de backup
 * @param userDataPath Ruta al directorio de datos del usuario
 * @returns true si la restauración fue exitosa
 */
export function restoreFromBackup(backupPath: string, userDataPath: string): boolean {
    const dbPath = path.join(userDataPath, 'p2p-chat.db');

    // Verificar que el backup existe
    if (!fs.existsSync(backupPath)) {
        error('Backup file not found', { backupPath }, 'backup');
        return false;
    }

    // Verificar que el backup tenga un tamaño razonable (> 1KB)
    const stats = fs.statSync(backupPath);
    if (stats.size < 1024) {
        error('Backup file too small, possibly corrupted', { size: stats.size }, 'backup');
        return false;
    }

    try {
        // Hacer backup de la base de datos actual antes de restaurar (por si acaso)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const currentBackup = path.join(userDataPath, `p2p-chat.db.pre-restore-${timestamp}`);
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, currentBackup);
            info('Current database backed up before restore', { backup: currentBackup }, 'backup');
        }

        // Copiar backup sobre la base de datos actual
        fs.copyFileSync(backupPath, dbPath);

        // Preservar permisos
        fs.chmodSync(dbPath, 0o600);

        info('Database restored from backup', {
            backup: path.basename(backupPath),
            size: stats.size,
            originalBackup: currentBackup
        }, 'backup');

        return true;
    } catch (err) {
        error('Failed to restore database from backup', err, 'backup');
        return false;
    }
}