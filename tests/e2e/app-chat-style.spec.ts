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
        ],
        groups: [],
        messagesByChat: {
            alice: [
                {
                    id: 'alice-style-1',
                    upeerId: 'alice',
                    message: 'hola',
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 60_000,
                },
            ],
        },
    };
}

async function mount(page: Page) {
    await installUpeerBridge(page, scenario());
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function pickStyle(page: Page, styleId: string) {
    await page.getByRole('button', { name: 'Opciones del chat con Alice' }).click();
    await page.getByRole('menuitem', { name: 'Estilo del chat' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Estilo del chat' })).toBeVisible();
    await page.locator(`[data-chat-style-option="${styleId}"]`).click();
}

test('aplica el estilo elegido al fondo de la conversación', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();

    await expect(page.locator('[data-chat-style]')).toHaveAttribute('data-chat-style', 'default');

    await pickStyle(page, 'ocean');

    const background = await page.locator('[data-chat-style]').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toContain('gradient');

    await page.getByRole('button', { name: 'Opciones del chat con Alice' }).click();
    await page.getByRole('menuitem', { name: 'Estilo del chat' }).click();
    await expect(page.locator('[data-chat-style-option="ocean"]')).toHaveAttribute('aria-checked', 'true');
});

test('recuerda el estilo por chat tras recargar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await pickStyle(page, 'night');

    await expect(page.locator('[data-chat-style]')).toHaveAttribute('data-chat-style', 'night');

    await page.reload();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();

    await expect(page.locator('[data-chat-style]')).toHaveAttribute('data-chat-style', 'night');
});

test('volver al predeterminado quita el fondo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await pickStyle(page, 'forest');
    await expect(page.locator('[data-chat-style]')).toHaveAttribute('data-chat-style', 'forest');

    await pickStyle(page, 'default');
    await expect(page.locator('[data-chat-style]')).toHaveAttribute('data-chat-style', 'default');

    const background = await page.locator('[data-chat-style]').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toBe('none');
});
