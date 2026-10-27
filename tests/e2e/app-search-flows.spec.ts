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
                ...Array.from({ length: 45 }, (_, index) => ({
                    id: `alice-bulk-${index}`,
                    upeerId: 'alice',
                    message: `acero en el fondo ${index}`,
                    isMine: index % 2 === 0,
                    status: 'sent',
                    timestamp: now - 120_000 - index * 60_000,
                })),
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

test('el buscador de chat vive dentro del panel de info y agrupa por día', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page, searchScenario());
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.getByRole('button', { name: 'Buscar en el chat' }).click();

    await expect(page.getByText('Info. del contacto')).toBeHidden();
    await expect(page.getByText('Buscar mensajes')).toBeVisible();
    await expect(page.getByText('Busca en toda la conversación')).toBeVisible();

    await page.getByLabel('Buscar mensajes en esta conversación').fill('aguja');

    const results = page.getByRole('button', { name: /Ir al mensaje:/ });
    await expect(results.first()).toBeVisible();
    await expect(page.locator('svg.lucide-check-check').first()).toBeVisible();
    await expect(page.locator('svg.lucide-calendar-days')).toBeVisible();
    await expect(page.getByText(/últimos 50/)).toHaveCount(0);

    const layout = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panels: document.querySelectorAll('[aria-label="Volver desde la búsqueda"]').length,
    }));

    expect(layout.page).toBeLessThanOrEqual(0);
    expect(layout.panels).toBe(1);
    await expect(results.first()).not.toContainText('📎');

    await page.getByRole('button', { name: 'Volver desde la búsqueda' }).click();
    await expect(page.getByText('Info. del contacto')).toBeVisible();
    await expect(page.getByText('Busca en toda la conversación')).toBeHidden();
});

test('el calendario de la búsqueda filtra por el día elegido', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page, searchScenario());
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.getByRole('button', { name: 'Buscar en el chat' }).click();
    await page.getByLabel('Buscar mensajes en esta conversación').fill('aguja');

    const results = page.getByRole('button', { name: /Ir al mensaje:/ });
    await expect(results).toHaveCount(2);

    const today = new Date();
    const dayLabel = `Filtrar por ${today.getDate()} de ${today.toLocaleDateString('es-ES', { month: 'long' })} ${today.getFullYear()}`;
    await page.getByRole('button', { name: 'Filtrar por fecha' }).click();
    await expect(page.getByText(/^octubre 2026$|^[a-z]+ \d{4}$/)).toBeVisible();
    await page.getByRole('button', { name: dayLabel }).click();

    const visibleDay = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    await expect(page.getByText(`Filtrando el ${visibleDay}`)).toBeVisible();
    await expect(results).toHaveCount(2);

    await page.getByLabel('Quitar el filtro de fecha activo').click();
    await expect(page.getByText(`Filtrando el ${visibleDay}`)).toHaveCount(0);
});

test('la búsqueda de chat pagina con scroll infinito por toda la conversación', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page, searchScenario());
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.getByRole('button', { name: 'Buscar en el chat' }).click();
    await page.getByLabel('Buscar mensajes en esta conversación').fill('acero en el fondo');

    const results = page.getByRole('button', { name: /Ir al mensaje:/ });
    await expect(results.first()).toBeVisible();
    const firstCount = await results.count();
    expect(firstCount).toBeLessThanOrEqual(40);

    const scroller = page.getByLabel('Buscar mensajes en esta conversación').locator('xpath=../../..');
    await scroller.evaluate((element) => {
        const scrollable = Array.from(element.querySelectorAll('div')).find((child) => child.scrollHeight > child.clientHeight + 10) ?? element;
        scrollable.scrollTop = scrollable.scrollHeight;
    });
    await expect(results).toHaveCount(45, { timeout: 5000 });
    await expect(page.getByText('45 resultados en toda la conversación')).toBeVisible();
});

test('los mensajes destacados se reúnen en el panel de info del chat', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page, searchScenario());
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();

    await page.getByLabel('Abrir info del contacto Alice').click();
    await page.getByRole('button', { name: 'Abrir mensajes destacados' }).click();
    await expect(page.getByText('Aún no hay mensajes destacados')).toBeVisible();
    await page.getByRole('button', { name: 'Volver a la ficha del contacto' }).click();

    await page.locator('#msg-alice-other').hover();
    await page.getByLabel('Abrir acciones del mensaje alice-other').click();
    await page.getByRole('menuitem', { name: 'Destacar' }).click();

    await page.getByRole('button', { name: 'Abrir mensajes destacados' }).click();
    await expect(page.getByText('1 mensaje').last()).toBeVisible();
    const entry = page.getByRole('button', { name: 'Ir al mensaje destacado: otro mensaje' });
    await expect(entry).toBeVisible();
    await expect(page.getByText('Aún no hay mensajes destacados')).toHaveCount(0);

    await entry.click();
    await expect(page.getByText('Info. del contacto')).toBeVisible();
    await expect(page.locator('#msg-alice-other')).toBeVisible();
});

test('la lista global de destacados reúne los de todos los chats', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount(page, searchScenario());

    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Mensajes destacados' }).click();
    await expect(page.getByText('No hay mensajes destacados')).toBeVisible();
    await page.getByRole('button', { name: 'Volver a los chats' }).click();
    await expect(page.getByRole('button', { name: 'Abrir chat con Alice' })).toBeVisible();

    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.locator('#msg-alice-other').hover();
    await page.getByLabel('Abrir acciones del mensaje alice-other').click();
    await page.getByRole('menuitem', { name: 'Destacar' }).click();

    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Mensajes destacados' }).click();
    await expect(page.getByText('1 mensaje').first()).toBeVisible();
    const starredEntry = page.getByRole('button', { name: 'Ir al mensaje destacado de Alice: otro mensaje' });
    await expect(starredEntry).toBeVisible();

    await starredEntry.click();
    await expect(page.locator('#msg-alice-other')).toBeVisible();
});
