import { expect, test, type Page } from '@playwright/test';

import { installUpeerBridge } from './support/upeerBridge.js';

const backups = [
    { name: 'p2p-chat.db.backup-2025-03-04', createdAt: '2025-03-04T09:00:00.000Z', bytes: 2 * 1024 * 1024 },
    { name: 'p2p-chat.db.backup-2025-03-03', createdAt: '2025-03-03T09:00:00.000Z', bytes: 512 },
];

async function openStorageSettings(page: Page, databaseBackups = backups) {
    await installUpeerBridge(page, {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [],
        groups: [],
        messagesByChat: {},
        identityStatus: { isLocked: false },
        databaseBackups,
    });
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeAttached();
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: /Almacenamiento/ }).click();
    await expect(page.getByText(/Qué ocupa uPeer en este dispositivo/)).toBeVisible();
}

test('lista las copias de la base con su tamaño', async ({ page }) => {
    await openStorageSettings(page);

    await expect(page.getByText('Copias de la base de datos')).toBeVisible();
    await expect(page.getByText(/Se conservan 7 días/)).toBeVisible();
    await expect(page.getByText('2.0 MB')).toBeVisible();
    await expect(page.getByText('512 B')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restaurar' })).toHaveCount(2);
});

test('avisa cuando todavía no hay copias', async ({ page }) => {
    await openStorageSettings(page, []);

    await expect(page.getByText(/Todavía no hay copias/)).toBeVisible();
});

test('restaura una copia tras confirmarlo y ofrece reiniciar', async ({ page }) => {
    await openStorageSettings(page);

    await page.getByRole('button', { name: 'Restaurar' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Restaurar la copia')).toBeVisible();
    await expect(dialog.getByText(/Se reemplazará la base de datos actual/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Restaurar', exact: true }).click();

    await expect(page.getByText(/Reinicia uPeer para usarla/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reiniciar ahora' })).toBeVisible();
});

test('cancelar la confirmación no toca ninguna copia', async ({ page }) => {
    await openStorageSettings(page);

    await page.getByRole('button', { name: 'Restaurar' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/Reinicia uPeer para usarla/)).toHaveCount(0);
});
