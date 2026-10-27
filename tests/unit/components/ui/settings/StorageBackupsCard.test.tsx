import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listDatabaseBackups = vi.fn();
const restoreDatabaseBackup = vi.fn();
const restartApp = vi.fn();

type BackupUpeer = Pick<Window['upeer'], 'listDatabaseBackups' | 'restoreDatabaseBackup' | 'restartApp'>;
(window as unknown as { upeer: BackupUpeer }).upeer = {
    listDatabaseBackups,
    restoreDatabaseBackup,
    restartApp,
};

import { StorageBackupsCard } from '../../../../../src/components/ui/settings/StorageBackupsCard';

const backups = [
    { name: 'p2p-chat.db.backup-2025-03-04', createdAt: '2025-03-04T09:00:00.000Z', bytes: 2 * 1024 * 1024 },
    { name: 'p2p-chat.db.backup-2025-03-03', createdAt: '2025-03-03T09:00:00.000Z', bytes: 512 },
];

const clickConfirmRestore = (): void => {
    const buttons = screen.getAllByText('Restaurar');
    const confirm = buttons[buttons.length - 1];
    if (!confirm) throw new Error('No hay botón de confirmación para restaurar');
    fireEvent.click(confirm);
};

describe('StorageBackupsCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listDatabaseBackups.mockResolvedValue({ backups, retentionDays: 7 });
        restoreDatabaseBackup.mockResolvedValue({ restored: true });
        restartApp.mockResolvedValue({ success: true });
    });

    it('lists every backup with its size and the retention window', async () => {
        render(<StorageBackupsCard />);

        expect(await screen.findByText(/Se conservan 7 días/)).toBeTruthy();
        expect(screen.getByText('2.0 MB')).toBeTruthy();
        expect(screen.getByText('512 B')).toBeTruthy();
        expect(screen.getAllByText('Restaurar')).toHaveLength(2);
    });

    it('says so when there are no backups yet', async () => {
        listDatabaseBackups.mockResolvedValue({ backups: [], retentionDays: 7 });

        render(<StorageBackupsCard />);

        expect(await screen.findByText(/Todavía no hay copias/)).toBeTruthy();
    });

    it('restores after confirming and offers to restart', async () => {
        render(<StorageBackupsCard />);

        fireEvent.click((await screen.findAllByText('Restaurar'))[0]);
        expect(await screen.findByText('Restaurar la copia')).toBeTruthy();

        clickConfirmRestore();

        await waitFor(() => {
            expect(restoreDatabaseBackup).toHaveBeenCalledWith('p2p-chat.db.backup-2025-03-04');
        });
        expect(await screen.findByText(/Reinicia uPeer para usarla/)).toBeTruthy();

        fireEvent.click(screen.getByText('Reiniciar ahora'));
        await waitFor(() => expect(restartApp).toHaveBeenCalled());
    });

    it('keeps the failure visible when restoring does not work', async () => {
        restoreDatabaseBackup.mockResolvedValue({ restored: false, error: 'La copia ya no está en el disco' });

        render(<StorageBackupsCard />);

        fireEvent.click((await screen.findAllByText('Restaurar'))[0]);
        clickConfirmRestore();

        expect(await screen.findByText('La copia ya no está en el disco')).toBeTruthy();
        expect(restartApp).not.toHaveBeenCalled();
    });

    it('shows the failure when the backup list cannot be read', async () => {
        listDatabaseBackups.mockRejectedValue(new Error('ENOENT'));

        render(<StorageBackupsCard />);

        expect(await screen.findByText('ENOENT')).toBeTruthy();
    });
});
