import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge, readBridgeState } from './support/upeerBridge.js';

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
                    id: 'alice-temp-1',
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
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
}

async function pickRetention(page: Page, retentionId: string) {
    await page.getByRole('button', { name: 'Opciones del chat con Alice' }).click();
    await page.getByRole('menuitem', { name: /Mensajes temporales/ }).click();
    await expect(page.getByRole('radiogroup', { name: 'Mensajes temporales' })).toBeVisible();
    await page.locator(`[data-retention-option="${retentionId}"]`).click();
}

test('activa los mensajes temporales y avisa en la conversación', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);

    await expect(page.locator('[data-retention-notice]')).toHaveCount(0);

    await pickRetention(page, '24h');

    await expect(page.locator('[data-retention-notice]')).toContainText('24 h');

    await page.getByRole('button', { name: 'Opciones del chat con Alice' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mensajes temporales · 24 h' })).toBeVisible();

    const state = await readBridgeState(page);
    expect(state.retention).toEqual({ alice: '24h' });
});

test('desactivarlos quita el aviso y la marca del menú', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page);

    await pickRetention(page, '7d');
    await expect(page.locator('[data-retention-notice]')).toContainText('7 días');

    await pickRetention(page, 'off');
    await expect(page.locator('[data-retention-notice]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Opciones del chat con Alice' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mensajes temporales' })).toBeVisible();

    const state = await readBridgeState(page);
    expect(state.retention).toEqual({});
});
