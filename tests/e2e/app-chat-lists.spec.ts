import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge } from './support/upeerBridge.js';

const now = Date.now();

function scenario(): Parameters<typeof installUpeerBridge>[1] {
    return {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [
            {
                upeerId: 'alice',
                name: 'Alice',
                address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0001',
                status: 'connected',
                publicKey: 'alice-pk',
                lastSeen: new Date(now).toISOString(),
                lastMessage: 'hola',
                lastMessageTime: new Date(now).toISOString(),
                vouchScore: 80,
            },
            {
                upeerId: 'bob',
                name: 'Bob',
                address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0002',
                status: 'connected',
                publicKey: 'bob-pk',
                lastSeen: new Date(now - 3_600_000).toISOString(),
                lastMessage: 'qué tal',
                lastMessageTime: new Date(now - 3_600_000).toISOString(),
                vouchScore: 60,
            },
        ],
        groups: [],
        messagesByChat: { alice: [], bob: [] },
    };
}

async function mount(page: Page) {
    await installUpeerBridge(page, scenario());
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function openLists(page: Page) {
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Listas' }).click();
    await expect(page.getByRole('button', { name: 'Crear' })).toBeVisible();
}

async function createList(page: Page, name: string) {
    await page.getByRole('button', { name: 'Crear' }).click();
    await page.getByLabel('Nombre de la lista').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('button', { name: `Eliminar la lista ${name}` })).toBeVisible();
}

test('crea una lista, le añade un chat y filtra la barra lateral', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);

    await openLists(page);
    await createList(page, 'Trabajo');

    await page.getByRole('button', { name: 'Elegir chats de Trabajo' }).click();
    await page.getByLabel('Incluir Alice en la lista').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Hecho' }).click();

    await page.getByRole('button', { name: 'Ver la lista Trabajo' }).click();

    await expect(page.locator('[data-active-list]')).toContainText('Trabajo');
    await expect(page.getByRole('button', { name: 'Abrir chat con Alice' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir chat con Bob' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Quitar el filtro de la lista' }).click();

    await expect(page.locator('[data-active-list]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir chat con Bob' })).toBeVisible();
});

test('la lista sobrevive a recargar y se puede eliminar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);

    await openLists(page);
    await createList(page, 'Familia');

    await page.reload();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await openLists(page);
    await expect(page.getByRole('button', { name: 'Eliminar la lista Familia' })).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar la lista Familia' }).click();
    await expect(page.getByRole('button', { name: 'Eliminar la lista Familia' })).toHaveCount(0);
    await expect(page.getByText(/Una lista agrupa los chats/)).toBeVisible();
});
