import { expect, test, type Page } from '@playwright/test';
import { emitBridgeEvent, installUpeerBridge, patchBridgeGroup } from './support/upeerBridge.js';

const now = Date.now();

async function mount(page: Page, scenario: Parameters<typeof installUpeerBridge>[1]) {
    await installUpeerBridge(page, scenario);
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
}

function directScenario(): Parameters<typeof installUpeerBridge>[1] {
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
        ],
        groups: [],
        messagesByChat: {
            alice: [],
        },
    };
}

function groupScenario(): Parameters<typeof installUpeerBridge>[1] {
    return {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [
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
                groupId: 'grp-events-1',
                name: 'Grupo Eventos',
                adminUpeerId: 'self-id',
                members: ['self-id', 'bob'],
                status: 'active',
                lastMessage: '',
                lastMessageTime: null,
            },
        ],
        messagesByChat: {
            'grp-events-1': [
                {
                    id: 'group-own-1',
                    upeerId: 'grp-events-1',
                    groupId: 'grp-events-1',
                    message: 'Mensaje propio de grupo',
                    isMine: true,
                    status: 'sent',
                    timestamp: now - 30_000,
                    senderUpeerId: 'self-id',
                    senderName: 'Yo',
                },
            ],
        },
    };
}

function chatEditor(page: Page) {
    return page.locator('[contenteditable="true"]').first();
}

async function openAliceChat(page: Page) {
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await expect(page.getByText('Alice').first()).toBeVisible();
}

test('refleja delivered y read remotos en mensajes propios', async ({ page }) => {
    await mount(page, directScenario());
    await openAliceChat(page);

    await chatEditor(page).click();
    await chatEditor(page).pressSequentially('Mensaje para estados');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();

    const latestBubble = page.getByText('Mensaje para estados').last().locator('..').locator('..');
    await expect(page.getByLabel('Estado del mensaje: enviado').last()).toBeVisible();

    await emitBridgeEvent(page, 'onMessageDelivered', { id: 'e2e-msg-1', upeerId: 'alice' });
    await expect(page.getByLabel('Estado del mensaje: entregado').last()).toBeVisible();

    await emitBridgeEvent(page, 'onMessageRead', { id: 'e2e-msg-1', upeerId: 'alice' });
    await expect(page.getByLabel('Estado del mensaje: leído').last()).toBeVisible();
    await expect(latestBubble).toContainText('Mensaje para estados');
});

test('vacía el chat cuando llega un evento remoto de chat cleared', async ({ page }) => {
    await mount(page, directScenario());
    await openAliceChat(page);

    await emitBridgeEvent(page, 'onReceive', {
        id: 'remote-clear-1',
        upeerId: 'alice',
        message: 'Se va a borrar',
        isMine: false,
        timestamp: Date.now(),
        status: 'delivered',
    });
    await expect(page.getByText('Se va a borrar')).toBeVisible();

    await emitBridgeEvent(page, 'onChatCleared', { upeerId: 'alice' });
    await expect(page.getByText('Se va a borrar')).toHaveCount(0);
    await expect(page.getByText('Conversación Segura Activada')).toBeVisible();
});

test('refresca lista y chat tras invitación y actualización remota de grupo', async ({ page }) => {
    await mount(page, groupScenario());

    await patchBridgeGroup(page, 'grp-events-2', {
        name: 'Grupo Invitado',
        adminUpeerId: 'bob',
        members: ['self-id', 'bob'],
        status: 'active',
        lastMessage: '',
        lastMessageTime: null,
    });
    await emitBridgeEvent(page, 'onGroupInvite', { groupId: 'grp-events-2' });
    await expect(page.getByRole('button', { name: 'Abrir grupo Grupo Invitado' })).toBeVisible();

    await page.getByRole('button', { name: 'Abrir grupo Grupo Eventos' }).click();
    await patchBridgeGroup(page, 'grp-events-1', {
        name: 'Grupo Eventos Renombrado',
        members: ['self-id', 'bob', 'nuevo'],
    });
    await emitBridgeEvent(page, 'onGroupUpdated', { groupId: 'grp-events-1', members: ['self-id', 'bob', 'nuevo'] });

    await expect(page.getByText('Grupo Eventos Renombrado').first()).toBeVisible();
    await expect(page.getByText('3 miembros').first()).toBeVisible();

    await emitBridgeEvent(page, 'onGroupMessageDelivered', {
        id: 'group-own-1',
        groupId: 'grp-events-1',
        upeerId: 'bob',
    });
    await expect(page.getByLabel('Estado del mensaje: leído').last()).toBeVisible();
});
