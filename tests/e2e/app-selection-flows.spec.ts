import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge, readBridgeState } from './support/upeerBridge.js';

const now = Date.now();

async function mount(page: Page) {
    await installUpeerBridge(page, {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [
            {
                upeerId: 'alice',
                name: 'Alice',
                address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0001',
                status: 'connected',
                publicKey: 'alice-pk',
                lastSeen: new Date(now).toISOString(),
                lastActive: new Date(now).toISOString(),
                lastMessage: 'Hola',
                lastMessageTime: new Date(now).toISOString(),
                vouchScore: 80,
            },
        ],
        groups: [],
        messagesByChat: {
            alice: [
                {
                    id: 'alice-1',
                    upeerId: 'alice',
                    message: 'Primero de Alice',
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 240_000,
                },
                {
                    id: 'mine-1',
                    upeerId: 'alice',
                    message: 'Segundo mío',
                    isMine: true,
                    status: 'read',
                    timestamp: now - 180_000,
                },
                {
                    id: 'alice-2',
                    upeerId: 'alice',
                    message: 'Tercero de Alice',
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 120_000,
                },
            ],
        },
    });
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.locator('[aria-label="Abrir chat con Alice"]').first().click();
}

async function openMessageMenu(page: Page, msgId: string) {
    await page.locator(`#msg-${msgId}`).hover();
    await page.locator(`[aria-label="Abrir acciones del mensaje ${msgId}"]`).first().click();
}

async function startSelection(page: Page, msgId: string) {
    await openMessageMenu(page, msgId);
    await page.getByText('Seleccionar', { exact: true }).click();
    await expect(page.getByTestId('selection-toolbar')).toBeVisible();
}

test('selecciona varios mensajes y los copia en orden', async ({ page }) => {
    await mount(page);

    await startSelection(page, 'alice-1');
    await expect(page.getByText('1 seleccionado')).toBeVisible();

    await page.locator('#msg-mine-1').click();
    await expect(page.getByText('2 seleccionados')).toBeVisible();

    await page.getByRole('button', { name: 'Copiar seleccionados' }).click();
    await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);

    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.clipboard.at(-1);
    }).toBe('Primero de Alice\nSegundo mío');
});

test('elimina en lote solo los mensajes propios', async ({ page }) => {
    await mount(page);

    await startSelection(page, 'alice-1');
    await page.locator('#msg-mine-1').click();
    await expect(page.getByText('2 seleccionados')).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar seleccionados' }).click();

    await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
    await expect(page.getByText('Mensaje eliminado')).toHaveCount(1);
    await expect(page.getByText('Primero de Alice')).toBeVisible();
});

test('sale del modo de selección sin tocar nada', async ({ page }) => {
    await mount(page);

    await startSelection(page, 'mine-1');
    await page.getByRole('button', { name: 'Salir de la selección' }).click();
    await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
    await expect(page.locator('#msg-mine-1')).not.toHaveAttribute('data-selected');
});

test('reenvía los mensajes seleccionados desde el modal', async ({ page }) => {
    await mount(page);

    await startSelection(page, 'alice-1');
    await page.locator('#msg-mine-1').click();
    await page.getByRole('button', { name: 'Reenviar seleccionados' }).click();

    await expect(page.getByText('Reenviar mensaje a')).toBeVisible();
    await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
});
