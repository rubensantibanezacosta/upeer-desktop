import { expect, test, type Page } from '@playwright/test';
import { installUpeerBridge, readBridgeState } from './support/upeerBridge.js';

const now = Date.now();
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8sWQAAAAASUVORK5CYII=';

async function mount(page: Page, scenario: Parameters<typeof installUpeerBridge>[1]) {
    await installUpeerBridge(page, scenario);
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
}

function chatEditor(page: Page) {
    return page.locator('[contenteditable="true"]').first();
}

function forwardingScenario(): Parameters<typeof installUpeerBridge>[1] {
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
                lastMessage: 'Hola desde Alice',
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
                lastMessage: '',
                lastMessageTime: null,
            },
        ],
        messagesByChat: {
            alice: [
                {
                    id: 'alice-1',
                    upeerId: 'alice',
                    message: 'Hola desde Alice',
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 120_000,
                },
            ],
            bob: [],
            'team-1': [],
        },
    };
}

function mediaScenario(): Parameters<typeof installUpeerBridge>[1] {
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
                lastMessage: 'Foto compartida',
                lastMessageTime: new Date(now).toISOString(),
                vouchScore: 80,
            },
        ],
        groups: [],
        messagesByChat: {
            alice: [
                {
                    id: 'alice-media-message',
                    upeerId: 'alice',
                    message: JSON.stringify({
                        type: 'file',
                        transferId: 'alice-media-transfer',
                        fileName: 'foto-compartida.png',
                        fileSize: 2048,
                        mimeType: 'image/png',
                        fileHash: 'hash-foto-compartida',
                        thumbnail: tinyPng,
                        caption: 'Foto compartida',
                        savedPath: '/tmp/foto-compartida.png',
                        state: 'completed',
                        direction: 'receiving',
                    }),
                    isMine: false,
                    status: 'delivered',
                    timestamp: now - 60_000,
                },
            ],
        },
        transfers: [
            {
                fileId: 'alice-media-transfer',
                upeerId: 'alice',
                chatUpeerId: 'alice',
                direction: 'receiving',
                state: 'completed',
                progress: 100,
                fileName: 'foto-compartida.png',
                fileSize: 2048,
                mimeType: 'image/png',
                savedPath: '/tmp/foto-compartida.png',
            },
        ],
    };
}

async function openAliceChat(page: Page) {
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await expect(page.getByText('Alice').first()).toBeVisible();
}

async function latestMessageId(page: Page, chatId = 'alice') {
    const state = await readBridgeState(page);
    const messages = state.messagesByChat[chatId] ?? [];
    expect(messages.length).toBeGreaterThan(0);
    return messages[messages.length - 1].id;
}

async function openMessageActions(page: Page, msgId: string) {
    await page.locator(`#msg-${msgId}`).hover();
    await page.getByLabel(`Abrir acciones del mensaje ${msgId}`).click();
}

test('responde a un mensaje y lo reenvía a un contacto y a un grupo', async ({ page }) => {
    await mount(page, forwardingScenario());
    await openAliceChat(page);

    await openMessageActions(page, 'alice-1');
    await page.getByRole('menuitem', { name: 'Responder' }).click();
    await expect(page.getByLabel('Barra de respuesta')).toContainText('Hola desde Alice');

    await chatEditor(page).click();
    await chatEditor(page).pressSequentially('Respuesta con cita');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();

    const repliedId = await latestMessageId(page);
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        const message = (state.messagesByChat.alice ?? []).find((entry) => entry.id === repliedId);
        return message?.replyTo ?? null;
    }).toBe('alice-1');

    await openMessageActions(page, repliedId);
    await page.getByRole('menuitem', { name: 'Reenviar' }).click();
    await expect(page.getByText('Reenviar mensaje a')).toBeVisible();
    await page.getByLabel('Seleccionar destino Bob').click();
    await page.getByLabel('Seleccionar destino Equipo QA').click();
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return (state.messagesByChat.bob ?? []).at(-1)?.message ?? null;
    }).toBe('Respuesta con cita');
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return (state.messagesByChat['team-1'] ?? []).at(-1)?.message ?? null;
    }).toBe('Respuesta con cita');
});

test('responde a un adjunto desde el visor multimedia', async ({ page }) => {
    await mount(page, mediaScenario());
    await openAliceChat(page);

    await page.getByTestId('media-file-message-container').click();
    await expect(page.getByLabel('Responder desde visor')).toBeVisible();
    await page.getByLabel('Responder desde visor').click();

    await expect(page.getByLabel('Barra de respuesta')).toContainText('foto-compartida.png');
    await chatEditor(page).click();
    await chatEditor(page).pressSequentially('Respuesta al adjunto');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();

    const repliedId = await latestMessageId(page);
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        const message = (state.messagesByChat.alice ?? []).find((entry) => entry.id === repliedId);
        return message?.replyTo ?? null;
    }).toBe('alice-media-message');
});

test('descarga y reacciona a un adjunto desde el visor multimedia', async ({ page }) => {
    await mount(page, mediaScenario());
    await openAliceChat(page);

    await page.getByTestId('media-file-message-container').click();
    await page.getByLabel('Descargar desde visor').click();
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.transfers.find((entry) => entry.fileId === 'alice-media-transfer')?.savedPath ?? null;
    }).toBe('/tmp/e2e-saved-file');

    await page.getByLabel('Reaccionar desde visor').click();
    await page.getByRole('button', { name: 'Reacción 👍 desde visor' }).click();
    await expect(page.getByLabel('Cerrar visor multimedia')).toHaveCount(0);
    await expect(page.locator('#msg-alice-media-message').getByText('👍')).toBeVisible();
});
