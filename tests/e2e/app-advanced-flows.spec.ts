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

function baseScenario(): Parameters<typeof installUpeerBridge>[1] {
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
                status: 'offline',
                publicKey: 'bob-pk',
                lastSeen: new Date(now - 3600_000).toISOString(),
                lastMessage: 'Hasta luego',
                lastMessageTime: new Date(now - 3600_000).toISOString(),
                vouchScore: 52,
            },
        ],
        groups: [],
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
        },
    };
}

function mediaScenario(): Parameters<typeof installUpeerBridge>[1] {
    const scenario = baseScenario();
    scenario.messagesByChat = {
        ...(scenario.messagesByChat ?? {}),
        alice: [
            ...(scenario.messagesByChat?.alice ?? []),
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
    };
    scenario.transfers = [
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
    ];
    return scenario;
}

async function openAliceChat(page: Page) {
    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await expect(page.getByText('Bienvenido a uPeer')).toHaveCount(0);
    await expect(page.getByLabel('Abrir info del contacto Alice')).toBeVisible();
}

async function sendChatMessage(page: Page, text: string) {
    await chatEditor(page).click();
    await chatEditor(page).pressSequentially(text);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText(text).last()).toBeVisible();
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

test('reacciona, edita y elimina mensajes propios', async ({ page }) => {
    await mount(page, baseScenario());
    await openAliceChat(page);

    await sendChatMessage(page, 'Mensaje con reacción');
    const reactionMsgId = await latestMessageId(page);
    await page.locator(`#msg-${reactionMsgId}`).hover();
    await page.getByLabel(`Reaccionar al mensaje ${reactionMsgId}`).click();
    await page.locator(`[aria-label="Me gusta en mensaje ${reactionMsgId}"]`).click();
    await expect(page.locator(`#msg-${reactionMsgId}`).getByText('👍')).toBeVisible();
    await page.locator(`#msg-${reactionMsgId}`).getByText('👍').click();
    await expect(page.locator(`#msg-${reactionMsgId}`).getByText('👍')).toHaveCount(0);

    await sendChatMessage(page, 'Mensaje original');
    const editableMsgId = await latestMessageId(page);
    await openMessageActions(page, editableMsgId);
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    await expect(page.getByText('Editando mensaje')).toBeVisible();
    await chatEditor(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await chatEditor(page).pressSequentially('Mensaje editado');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.locator(`#msg-${editableMsgId}`)).toContainText('Mensaje editado');
    await expect(page.locator(`#msg-${editableMsgId}`)).toContainText('(Editado)');

    await sendChatMessage(page, 'Mensaje a eliminar');
    const deletedMsgId = await latestMessageId(page);
    await openMessageActions(page, deletedMsgId);
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await expect(page.locator(`#msg-${deletedMsgId}`)).toContainText('Mensaje eliminado');
});

test('abre info del contacto y navega por cifrado y multimedia compartida', async ({ page }) => {
    await mount(page, mediaScenario());
    await openAliceChat(page);

    await page.getByLabel('Abrir info del contacto Alice').click();
    await expect(page.getByText('Info. del contacto')).toBeVisible();

    await page.getByLabel('Abrir detalles de cifrado').click();
    await expect(page.getByText('Los mensajes están protegidos')).toBeVisible();
    await page.getByLabel('Volver desde cifrado').click();

    await page.getByLabel('Abrir multimedia compartida').click();
    await expect(page.getByLabel('Volver desde multimedia')).toBeVisible();
    await expect(page.getByLabel('Abrir multimedia foto-compartida.png')).toBeVisible();
    await page.getByLabel('Volver desde multimedia').click();
    await page.getByLabel('Cerrar info del contacto').click();
    await expect(page.getByText('Info. del contacto')).toHaveCount(0);
});

test('vacía el chat desde la ficha de contacto', async ({ page }) => {
    await mount(page, baseScenario());
    await openAliceChat(page);

    await expect(page.getByText('Hola desde Alice')).toBeVisible();
    await page.getByLabel('Abrir info del contacto Alice').click();
    await page.getByText('Vaciar chat').click();
    await expect(page.getByText('Hola desde Alice')).toHaveCount(0);
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.messagesByChat.alice?.length ?? -1;
    }).toBe(0);
});

test('bloquea y desbloquea un contacto', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Contactos' }).click();
    await page.getByLabel('Abrir ficha de Alice').click();
    await page.getByRole('button', { name: 'Bloquear' }).click();
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.contacts.find((contact) => contact.upeerId === 'alice')?.status ?? 'missing';
    }).toBe('blocked');

    await page.getByRole('button', { name: 'Bloqueados' }).click();
    await page.getByLabel('Abrir ficha de Alice').click();
    await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.getByText('No hay contactos bloqueados')).toBeVisible();
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.contacts.find((contact) => contact.upeerId === 'alice')?.status ?? 'missing';
    }).toBe('connected');
});
