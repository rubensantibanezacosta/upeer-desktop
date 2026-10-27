import path from 'node:path';

export const BACKUP_NAME_PATTERN = /^p2p-chat\.db\.backup-\d{4}-\d{2}-\d{2}$/;

export type DatabaseBackup = {
    name: string;
    bytes: number;
    createdAt: string;
};

export function isBackupName(value: unknown): value is string {
    return typeof value === 'string' && BACKUP_NAME_PATTERN.test(value);
}

export function sortBackups(backups: DatabaseBackup[]): DatabaseBackup[] {
    return [...backups].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function backupLabel(createdAt: string): string {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return createdAt;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function resolveBackupPath(userDataPath: string, name: unknown): string | null {
    if (!userDataPath || !isBackupName(name)) return null;
    if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
    const resolved = path.resolve(userDataPath, name);
    const root = path.resolve(userDataPath);
    if (path.dirname(resolved) !== root) return null;
    return resolved;
}
