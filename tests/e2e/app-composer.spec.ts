import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge } from './support/upeerBridge.js';

const now = Date.now();

async function mount(page: Page) {
    await installUpeerBridge(page, {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [{
            upeerId: 'alice',
            name: 'Alice',
            address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0001',
            status: 'connected',
            publicKey: 'alice-pk',
            lastSeen: new Date(now).toISOString(),
            lastMessage: 'Hola',
            lastMessageTime: new Date(now).toISOString(),
            vouchScore: 80,
        }],
    });
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.locator('[aria-label="Abrir chat con Alice"]').first().click();
}

function composerBoxes(page: Page) {
    return page.evaluate(() => {
        const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
        const field = editor.parentElement as HTMLElement;
        const pill = field.parentElement as HTMLElement;
        const stage = pill.parentElement as HTMLElement;
        const send = document.querySelector('[aria-label="Enviar mensaje"], [aria-label="Grabar nota de voz"]') as HTMLElement;
        const height = (element: HTMLElement) => Math.round(element.getBoundingClientRect().height);
        return { editor: height(editor), field: height(field), pill: height(pill), stage: height(stage), send: height(send) };
    });
}

test('el compositor de una línea mide lo mismo que antes de admitir saltos', async ({ page }) => {
    await mount(page);
    const empty = await composerBoxes(page);

    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await editor.pressSequentially('Hola');
    const single = await composerBoxes(page);

    expect(empty).toEqual({ editor: 22, field: 44, pill: 52, stage: 68, send: 52 });
    expect(single).toEqual(empty);
});

test('Ctrl+Enter abre línea y la píldora crece sin mover el botón de enviar', async ({ page }) => {
    await mount(page);
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await editor.pressSequentially('Hola');
    await editor.press('Control+Enter');
    await editor.pressSequentially('Adios');

    expect(await composerBoxes(page)).toEqual({ editor: 44, field: 44, pill: 52, stage: 68, send: 52 });

    await editor.press('Control+Enter');
    await editor.pressSequentially('Tercera');
    const threeLines = await composerBoxes(page);
    expect(threeLines.pill).toBeGreaterThan(52);
    expect(threeLines.stage).toBeGreaterThan(68);
    expect(threeLines.send).toBe(52);
    expect(await editor.innerText()).toContain('Hola');
    expect(await editor.innerText()).toContain('Adios');
    expect(await editor.innerText()).toContain('Tercera');
});

test('el compositor deja de crecer y hace scroll al llegar al máximo', async ({ page }) => {
    await mount(page);
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    for (let index = 0; index < 12; index += 1) {
        await editor.pressSequentially(`Linea ${index}`);
        await editor.press('Control+Enter');
    }

    const boxes = await composerBoxes(page);
    expect(boxes.editor).toBe(132);
    expect(boxes.pill).toBe(132);
    expect(await editor.evaluate((element) => element.scrollTop > 0)).toBe(true);
});
