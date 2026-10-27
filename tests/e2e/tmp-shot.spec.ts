import { expect, test } from '@playwright/test';
import { installUpeerBridge } from './support/upeerBridge.js';

const now = Date.now();

test('shot', async ({ page }) => {
    await installUpeerBridge(page, {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [{ upeerId: 'alice', name: 'Alice', address: '200::1', status: 'connected', publicKey: 'pk', lastSeen: new Date(now).toISOString(), lastMessage: 'Hola', lastMessageTime: new Date(now).toISOString(), vouchScore: 80 }],
    });
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.locator('[aria-label="Abrir chat con Alice"]').first().click();
    await page.screenshot({ path: 'shot-empty.tmp.png', clip: { x: 300, y: 640, width: 980, height: 160 } });
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await editor.pressSequentially('Hola que tal');
    await page.screenshot({ path: 'shot-one.tmp.png', clip: { x: 300, y: 640, width: 980, height: 160 } });
});
