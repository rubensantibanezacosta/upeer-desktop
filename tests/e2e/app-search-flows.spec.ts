import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge } from './support/upeerBridge.js';

const now = Date.now();

async function mount(page: Page, scenario: Parameters<typeof installUpeerBridge>[1]) {
    await installUpeerBridge(page, scenario);
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
}

function searchScenario(): Parameters<typeof installUpeerBridge>[1] {
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
                lastMessage: 'irrelevante',
                lastMessageTime: new Date(now).toISOString(),
                vouchScore: 80,
            },
            {
                upeerId: 'bob',
                name: 'Bob',
                address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0002',
                status: 'connected',
                publicKey: 'bob-pk',
                lastSeen: new Date(now).toISOString(),
                lastMessage: '',
                lastMessageTime: null,
                vouchScore: 60,
            },
        ],
        groups: [
            {
                groupId: 'grp-search-1',
                name: 'Grupo Búsqueda',
                adminUpeerId: 'self-id',
                members: ['self-id', 'alice', 'bob'],
                status: 'active',
                lastMessage: '',
                lastMessageTime: null,
            },
        ],
        messagesByChat: {
            alice: [
                {
                    id: 'alice-search-hit',
                    upeerId: 'alice',
                    message: 'mensaje aguja directa',
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 90_000,
                },
                {
                    id: 'alice-other',
                    upeerId: 'alice',
                    message: 'otro mensaje',
                    isMine: true,
                    status: 'sent',
                    timestamp: now - 60_000,
                },
                {
                    id: 'alice-long',
                    upeerId: 'alice',
                    message: `${'texto larguísimo sin espacios '.repeat(8)}aguja larga`,
                    isMine: true,
                    status: 'sent',
                    timestamp: now - 55_000,
                },
            ],
            'grp-search-1': [
                {
                    id: 'group-search-hit',
                    upeerId: 'grp-search-1',
                    groupId: 'grp-search-1',
                    message: 'hallazgo en grupo alfa',
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 30_000,
                    senderUpeerId: 'bob',
                    senderName: 'Bob',
                },
            ],
            bob: [],
        },
    };
}

async function sidebarSearch(page: Page, text: string) {
    await page.getByPlaceholder('Busca chats, contactos, grupos o mensajes').fill(text);
}

test('abre un chat directo desde un resultado de búsqueda global', async ({ page }) => {
    await mount(page, searchScenario());

    await sidebarSearch(page, 'aguja directa');
    await expect(page.getByText('Mensajes')).toBeVisible();
    await page.getByText('mensaje aguja directa').click();

    await expect(page.getByText('Alice').first()).toBeVisible();
    await expect(page.locator('#msg-alice-search-hit')).toContainText('mensaje aguja directa');
});

test('abre un grupo desde un resultado de búsqueda global', async ({ page }) => {
    await mount(page, searchScenario());

    await sidebarSearch(page, 'grupo alfa');
    await expect(page.getByText('Mensajes')).toBeVisible();
    await page.getByText('hallazgo en grupo alfa').click();

    await expect(page.getByText('Grupo Búsqueda').first()).toBeVisible();
    await expect(page.locator('#msg-group-search-hit')).toContainText('hallazgo en grupo alfa');
});

test('muestra estados sin resultados en búsqueda global y nuevo chat', async ({ page }) => {
    await mount(page, searchScenario());

    await sidebarSearch(page, 'sin-coincidencias-globales');
    await expect(page.getByText('Nada coincide con "sin-coincidencias-globales".')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo chat' }).click();
    await page.getByRole('textbox', { name: 'Buscar contactos' }).first().fill('sin-coincidencias-contactos');
    await expect(page.getByText('Sin resultados para "sin-coincidencias-contactos"')).toBeVisible();
});

test('el buscador de chat abre un panel lateral con resultados agrupados por día', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await mount(page, searchScenario());
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.getByRole('button', { name: 'Buscar en el chat' }).click();

    await expect(page.getByText('Buscar mensajes')).toBeVisible();
    await expect(page.getByText('Escribe para buscar en esta conversación')).toBeVisible();

    await page.getByLabel('Buscar mensajes en esta conversación').fill('aguja');

    const results = page.getByRole('button', { name: /Ir al mensaje:/ });
    await expect(results.first()).toBeVisible();
    await expect(page.locator('svg.lucide-check-check').first()).toBeVisible();
    await expect(page.locator('svg.lucide-calendar-days')).toBeVisible();

    const panel = page.getByRole('complementary', { name: 'Buscador de la conversación' });
    const layout = await panel.evaluate((element) => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        overflowing: Array.from(element.querySelectorAll('*'))
            .filter((child) => child.scrollWidth - child.clientWidth > 2)
            .map((child) => child.tagName.toLowerCase()),
        panelHeight: Math.round(element.getBoundingClientRect().height),
        viewportHeight: window.innerHeight,
    }));

    expect(layout.page).toBeLessThanOrEqual(0);
    expect(layout.overflowing).toEqual([]);
    expect(Math.abs(layout.panelHeight - layout.viewportHeight)).toBeLessThanOrEqual(1);
    await expect(results.first()).not.toContainText('📎');
});

test('el calendario del panel filtra los resultados por día', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await mount(page, searchScenario());
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.getByRole('button', { name: 'Buscar en el chat' }).click();
    await page.getByLabel('Buscar mensajes en esta conversación').fill('aguja');

    const results = page.getByRole('button', { name: /Ir al mensaje:/ });
    await expect(results).toHaveCount(2);

    const today = new Date();
    const label = `Filtrar por ${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    await page.getByRole('button', { name: 'Filtrar por fecha' }).click();
    await page.getByRole('button', { name: label }).click();

    await expect(results).toHaveCount(2);
    await expect(page.getByText('No se han encontrado mensajes')).toHaveCount(0);
});
