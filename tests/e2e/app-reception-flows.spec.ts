import { expect, test, type Page } from '@playwright/test';
import { emitBridgeEvent, installUpeerBridge } from './support/upeerBridge.js';

const now = Date.now();
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8sWQAAAAASUVORK5CYII=';

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
                groupId: 'grp-live-1',
                name: 'Grupo recepción',
                adminUpeerId: 'self-id',
                members: ['self-id', 'bob'],
                status: 'active',
                lastMessage: '',
                lastMessageTime: null,
            },
        ],
        messagesByChat: {
            'grp-live-1': [],
        },
    };
}

function incomingMediaScenario(): Parameters<typeof installUpeerBridge>[1] {
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
                lastMessage: '',
                lastMessageTime: null,
                vouchScore: 80,
            },
        ],
        groups: [],
        messagesByChat: {
            alice: [],
        },
        transfers: [
            {
                fileId: 'incoming-media-1',
                upeerId: 'alice',
                chatUpeerId: 'alice',
                direction: 'receiving',
                state: 'completed',
                progress: 100,
                fileName: 'captura.png',
                fileSize: 2048,
                mimeType: 'image/png',
                savedPath: '/tmp/captura.png',
            },
        ],
    };
}

async function openAliceChat(page: Page) {
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await expect(page.getByText('Alice').first()).toBeVisible();
}

test('recibe reacciones, edición y borrado remotos sobre un mensaje directo', async ({ page }) => {
    await mount(page, directScenario());
    await openAliceChat(page);

    await emitBridgeEvent(page, 'onReceive', {
        id: 'incoming-direct-1',
        upeerId: 'alice',
        message: 'Mensaje remoto original',
        isMine: false,
        timestamp: Date.now(),
        status: 'delivered',
    });
    await expect(page.locator('#msg-incoming-direct-1')).toContainText('Mensaje remoto original');

    await emitBridgeEvent(page, 'onMessageReactionUpdated', {
        msgId: 'incoming-direct-1',
        upeerId: 'alice',
        chatUpeerId: 'alice',
        emoji: '👍',
        remove: false,
    });
    await expect(page.locator('#msg-incoming-direct-1').getByText('👍')).toBeVisible();

    await emitBridgeEvent(page, 'onMessageUpdated', {
        id: 'incoming-direct-1',
        chatUpeerId: 'alice',
        content: 'Mensaje remoto editado',
    });
    await expect(page.locator('#msg-incoming-direct-1')).toContainText('Mensaje remoto editado');
    await expect(page.locator('#msg-incoming-direct-1')).toContainText('(Editado)');

    await emitBridgeEvent(page, 'onMessageDeleted', {
        id: 'incoming-direct-1',
        upeerId: 'alice',
        chatUpeerId: 'alice',
    });
    await expect(page.locator('#msg-incoming-direct-1')).toContainText('Mensaje eliminado');
});

test('recibe mensajes de grupo en tiempo real con remitente correcto', async ({ page }) => {
    await mount(page, groupScenario());

    await page.getByRole('button', { name: 'Abrir grupo Grupo recepción' }).click();
    await expect(page.getByText('Grupo recepción').first()).toBeVisible();

    await emitBridgeEvent(page, 'onGroupMessage', {
        id: 'incoming-group-1',
        groupId: 'grp-live-1',
        upeerId: 'grp-live-1',
        message: 'Mensaje entrante del grupo',
        isMine: false,
        status: 'delivered',
        timestamp: Date.now(),
        senderUpeerId: 'bob',
        senderName: 'Bob',
    });

    await expect(page.locator('#msg-incoming-group-1')).toContainText('Mensaje entrante del grupo');
    await expect(page.locator('#msg-incoming-group-1')).toContainText('Bob');
});

test('recibe un adjunto multimedia y lo abre en el visor', async ({ page }) => {
    await mount(page, incomingMediaScenario());
    await openAliceChat(page);

    await emitBridgeEvent(page, 'onReceive', {
        id: 'incoming-media-message',
        upeerId: 'alice',
        message: JSON.stringify({
            type: 'file',
            transferId: 'incoming-media-1',
            fileName: 'captura.png',
            fileSize: 2048,
            mimeType: 'image/png',
            fileHash: 'hash-captura',
            thumbnail: tinyPng,
            caption: 'Captura entrante',
            savedPath: '/tmp/captura.png',
            state: 'completed',
            direction: 'receiving',
        }),
        isMine: false,
        timestamp: Date.now(),
        status: 'delivered',
    });

    await expect(page.getByText('Captura entrante')).toBeVisible();
    await page.getByTestId('media-file-message-container').click();
    await expect(page.getByLabel('Cerrar visor multimedia')).toBeVisible();
    await page.getByLabel('Ir al mensaje desde visor').click();
    await expect(page.getByLabel('Cerrar visor multimedia')).toHaveCount(0);
    await expect(page.locator('#msg-incoming-media-message')).toContainText('Captura entrante');
});
