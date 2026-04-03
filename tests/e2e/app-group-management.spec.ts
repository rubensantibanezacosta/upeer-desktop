import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge, readBridgeState } from './support/upeerBridge.js';

const now = Date.now();

async function mount(page: Page, scenario: Parameters<typeof installUpeerBridge>[1]) {
    await installUpeerBridge(page, scenario);
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
}

function groupScenario(): Parameters<typeof installUpeerBridge>[1] {
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
                lastMessage: 'Hola',
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
                groupId: 'team-1',
                name: 'Equipo QA',
                adminUpeerId: 'self-id',
                members: ['self-id', 'alice', 'bob'],
                status: 'active',
                lastMessage: 'Bienvenidos',
                lastMessageTime: new Date(now).toISOString(),
                isFavorite: false,
            },
            {
                groupId: 'team-2',
                name: 'Infra',
                adminUpeerId: 'self-id',
                members: ['self-id', 'alice'],
                status: 'active',
                lastMessage: '',
                lastMessageTime: new Date(now - 120_000).toISOString(),
                isFavorite: false,
            },
        ],
        messagesByChat: {
            'team-1': [
                {
                    id: 'team-1-msg-1',
                    upeerId: 'team-1',
                    groupId: 'team-1',
                    message: 'Bienvenidos',
                    isMine: true,
                    status: 'sent',
                    timestamp: now - 60_000,
                    senderUpeerId: 'self-id',
                    senderName: 'Yo',
                },
            ],
            'team-2': [],
        },
    };
}

async function openGroup(page: Page, groupName: string) {
    await page.getByRole('button', { name: `Abrir grupo ${groupName}` }).click();
    await expect(page.getByText(groupName).first()).toBeVisible();
}

async function openGroupActions(page: Page, groupId: string) {
    const groupRow = page.locator(`[aria-label="Abrir acciones del grupo ${groupId}"]`).locator('..').locator('..');
    await groupRow.hover();
    await page.locator(`[aria-label="Abrir acciones del grupo ${groupId}"]`).click();
}

test('renombra un grupo desde la cabecera', async ({ page }) => {
    await mount(page, groupScenario());
    await openGroup(page, 'Equipo QA');

    await page.getByLabel('Editar nombre del grupo').first().click();
    const input = page.getByLabel('Editar nombre del grupo');
    await input.click();
    await input.press('Control+A');
    await input.press('Backspace');
    await input.pressSequentially('Equipo QA Renombrado');
    await input.press('Enter');

    await expect(page.getByText('Equipo QA Renombrado').first()).toBeVisible();
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.groups.find((group) => group.groupId === 'team-1')?.name ?? null;
    }).toBe('Equipo QA Renombrado');
});

test('marca un grupo como favorito y aparece en el filtro de favoritos', async ({ page }) => {
    await mount(page, groupScenario());

    await openGroupActions(page, 'team-1');
    await page.getByRole('menuitem', { name: 'Añadir a Favoritos' }).click();

    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.groups.find((group) => group.groupId === 'team-1')?.isFavorite ?? false;
    }).toBe(true);

    await page.getByRole('button', { name: 'Favoritos' }).click();
    await expect(page.getByRole('button', { name: 'Abrir grupo Equipo QA' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir grupo Infra' })).toHaveCount(0);
});

test('elimina un grupo desde sus acciones laterales', async ({ page }) => {
    await mount(page, groupScenario());

    await openGroupActions(page, 'team-2');
    await page.getByRole('menuitem', { name: 'Eliminar grupo' }).click();
    await expect(page.getByText('Confirmar eliminación')).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar permanentemente' }).click();

    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.groups.some((group) => group.groupId === 'team-2');
    }).toBe(false);
    await expect(page.getByRole('button', { name: 'Abrir grupo Infra' })).toHaveCount(0);
});
