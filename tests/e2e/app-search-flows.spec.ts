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
    await page.getByPlaceholder('Buscar un chat o iniciar uno nuevo').fill(text);
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
    await expect(page.getByText('Sin resultados para "sin-coincidencias-globales"')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo chat' }).click();
    await page.getByRole('textbox', { name: 'Buscar contactos' }).first().fill('sin-coincidencias-contactos');
    await expect(page.getByText('Sin resultados para "sin-coincidencias-contactos"')).toBeVisible();
});
