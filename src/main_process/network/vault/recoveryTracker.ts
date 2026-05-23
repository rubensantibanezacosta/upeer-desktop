import { getMainWindow } from '../../core/windowManager.js';
import { warn } from '../../security/secure-logger.js';

export type VaultRecoveryContext = 'startup' | 'background';

type ActiveVaultRecoverySource = {
    context: VaultRecoveryContext;
    label: string;
    timeout: ReturnType<typeof setTimeout>;
};

const VAULT_RECOVERY_CHANNEL = 'vault-recovery-status';
const VAULT_RECOVERY_TIMEOUT_MS = 15_000;
const activeSources = new Map<string, ActiveVaultRecoverySource>();

function emitVaultRecoveryStatus() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
        return;
    }

    const sources = Array.from(activeSources.values());
    const pendingStartupSources = sources.filter((source) => source.context === 'startup').length;

    mainWindow.webContents.send(VAULT_RECOVERY_CHANNEL, {
        active: sources.length > 0,
        startupActive: pendingStartupSources > 0,
        pendingSources: sources.length,
        pendingStartupSources,
        message: pendingStartupSources > 0
            ? 'Recuperando mensajes y adjuntos guardados…'
            : 'Sincronizando mensajes guardados…',
    });
}

function scheduleTimeout(key: string, label: string, context: VaultRecoveryContext) {
    return setTimeout(() => {
        activeSources.delete(key);
        warn('Vault recovery source timed out', { key, label, context }, 'vault');
        emitVaultRecoveryStatus();
    }, VAULT_RECOVERY_TIMEOUT_MS);
}

export function beginVaultRecoverySource(key: string, label: string, context: VaultRecoveryContext = 'background') {
    if (!key) {
        return;
    }

    const previous = activeSources.get(key);
    if (previous) {
        clearTimeout(previous.timeout);
    }

    activeSources.set(key, {
        context,
        label,
        timeout: scheduleTimeout(key, label, context),
    });
    emitVaultRecoveryStatus();
}

export function touchVaultRecoverySource(key: string, label?: string, context?: VaultRecoveryContext) {
    if (!key) {
        return;
    }

    const previous = activeSources.get(key);
    const nextContext = context ?? previous?.context ?? 'background';
    const nextLabel = label ?? previous?.label ?? key;

    if (previous) {
        clearTimeout(previous.timeout);
    }

    activeSources.set(key, {
        context: nextContext,
        label: nextLabel,
        timeout: scheduleTimeout(key, nextLabel, nextContext),
    });
    emitVaultRecoveryStatus();
}

export function completeVaultRecoverySource(key: string) {
    const existing = activeSources.get(key);
    if (!existing) {
        return;
    }

    clearTimeout(existing.timeout);
    activeSources.delete(key);
    emitVaultRecoveryStatus();
}