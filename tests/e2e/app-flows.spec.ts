import { expect, test, type Page } from '@playwright/test';
import { emitBridgeEvent, installUpeerBridge, patchBridgeContact, queueFileDialogResult, readBridgeState } from './support/upeerBridge.js';

const now = Date.now();

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
            {
                upeerId: 'dana',
                name: 'Dana',
                address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0003',
                status: 'offline',
                publicKey: 'dana-pk',
                lastSeen: new Date(now - 7200_000).toISOString(),
                lastMessage: '',
                lastMessageTime: null,
                vouchScore: 49,
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
            dana: [],
        },
        linkPreviews: {
            'https://upeer.chat/docs': {
                url: 'https://upeer.chat/docs',
                title: 'uPeer Docs',
                description: 'Documentación de uPeer',
                siteName: 'uPeer',
            },
        },
    };
}

test('crea un contacto desde el estado vacío', async ({ page }) => {
    await mount(page, { contacts: [], groups: [], messagesByChat: {} });

    await expect(page.getByText('Sin conversaciones')).toBeVisible();
    await page.getByRole('button', { name: 'Nuevo chat' }).click();
    await page.getByLabel('Nueva conversación').click();
    await page.getByLabel('Identidad upeer').fill('nora@200:aaaa:bbbb:cccc:dddd:eeee:ffff:1234');
    await page.getByLabel('Alias del contacto').fill('Nora');
    await page.getByRole('button', { name: 'Añadir contacto' }).click();
    await page.locator('[aria-label="Abrir chat con Nora"]').first().click();

    await expect(page.getByText('Nora').first()).toBeVisible();
    await expect(chatEditor(page)).toBeVisible();
});

test('muestra contactos online y offline en la agenda', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Contactos' }).click();
    await expect(page.getByText('Contactos').first()).toBeVisible();

    await page.getByLabel('Abrir ficha de Alice').click();
    await expect(page.getByText('En línea')).toBeVisible();

    await page.getByLabel('Abrir ficha de Bob').click();
    await expect(page.getByText(/Última vez|Desconectado/)).toBeVisible();
});

test('envía mensajes directos, renderiza preview y recibe eventos en tiempo real', async ({ page }) => {
    await mount(page, baseScenario());

    await page.locator('[aria-label="Abrir chat con Alice"]').first().click();
    await chatEditor(page).click();
    await chatEditor(page).pressSequentially('Mira https://upeer.chat/docs');
    await expect(page.getByText('uPeer Docs').first()).toBeVisible();
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();

    await expect(page.getByText('Mira https://upeer.chat/docs').last()).toBeVisible();
    await expect(page.getByText('uPeer Docs').first()).toBeVisible();

    await emitBridgeEvent(page, 'onTyping', { upeerId: 'alice' });
    await expect(page.getByText(/escribiendo/i).first()).toBeVisible();

    await emitBridgeEvent(page, 'onReceive', {
        id: 'alice-live-1',
        upeerId: 'alice',
        message: 'Respuesta en vivo',
        isMine: false,
        timestamp: Date.now(),
        status: 'delivered',
    });

    await expect(page.getByText('Respuesta en vivo')).toBeVisible();
});

test('acepta una solicitud de contacto entrante y abre el chat normal', async ({ page }) => {
    const scenario: Parameters<typeof installUpeerBridge>[1] = baseScenario();
    scenario.contacts = [
        ...(scenario.contacts ?? []),
        {
            upeerId: 'eve',
            name: 'Eve',
            address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:9999',
            status: 'incoming',
            lastSeen: new Date(now).toISOString(),
        },
    ];
    scenario.messagesByChat = {
        ...(scenario.messagesByChat ?? {}),
        eve: [],
    };

    await mount(page, scenario);

    await emitBridgeEvent(page, 'onContactRequest', {
        upeerId: 'eve',
        publicKey: 'eve-pk',
        avatar: undefined,
        vouchScore: 50,
    });
    await emitBridgeEvent(page, 'onFocusConversation', { upeerId: 'eve' });

    await expect(page.getByText('Solicitud de Conexión')).toBeVisible();
    await page.getByRole('button', { name: /Aceptar y Conectar|Aceptar con Precaución/ }).click();
    await patchBridgeContact(page, 'eve', {
        status: 'connected',
        publicKey: 'eve-pk',
        lastSeen: new Date().toISOString(),
    });
    await emitBridgeEvent(page, 'onHandshakeFinished', { upeerId: 'eve' });
    await expect.poll(async () => {
        const state = await readBridgeState(page);
        return state.contacts.find((contact) => contact.upeerId === 'eve')?.status ?? 'missing';
    }).toBe('connected');
    await expect(page.getByText('Solicitud de Conexión')).not.toBeVisible();
});

test('crea un grupo, envía un mensaje e invita a otro miembro', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Nuevo chat' }).click();
    await page.getByLabel('Nuevo grupo').click();
    await page.getByLabel('Nombre del grupo lateral').fill('Proyecto X');
    await page.locator('[aria-label="Seleccionar contacto lateral Alice"]').click();
    await page.locator('[aria-label="Seleccionar contacto lateral Bob"]').click();
    await page.getByRole('button', { name: 'Crear grupo' }).click();

    await expect(page.getByText('Proyecto X').first()).toBeVisible();
    await expect(page.getByText('3 miembros').first()).toBeVisible();

    await chatEditor(page).click();
    await chatEditor(page).pressSequentially('Hola equipo');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('Hola equipo').last()).toBeVisible();

    await page.getByRole('button', { name: 'Añadir miembros' }).click();
    await expect(page.getByText('Añadir miembros').first()).toBeVisible();
    await page.locator('[aria-label="Seleccionar miembro Dana"]').click();
    await page.getByRole('button', { name: 'Añadir miembros' }).last().click();

    await expect(page.getByText('4 miembros').first()).toBeVisible();
});

test('previsualiza y envía adjuntos desde un chat directo', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await queueFileDialogResult(page, {
        success: true,
        canceled: false,
        files: [
            {
                path: '/tmp/manual.pdf',
                name: 'manual.pdf',
                size: 1024,
                type: 'application/pdf',
            },
        ],
    });

    await page.getByRole('button', { name: 'Adjuntar archivo' }).click();
    await page.getByText('Cualquier archivo').click();
    await expect(page.getByText('manual.pdf').first()).toBeVisible();
    await page.getByPlaceholder('Añade un comentario...').fill('PDF importante');
    await page.getByRole('button', { name: 'Enviar adjuntos' }).click();

    await expect(page.getByText('manual.pdf').first()).toBeVisible();
    await expect(page.getByText('PDF importante')).toBeVisible();
    const state = await readBridgeState(page);
    expect(state.transfers.some((transfer) => transfer.fileName === 'manual.pdf')).toBe(true);
});

test('comparte una tarjeta de contacto en un chat directo', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await page.getByRole('button', { name: 'Adjuntar archivo' }).click();
    await page.getByRole('menuitem').filter({ hasText: 'Contacto' }).click();
    await expect(page.getByText('Compartir contacto')).toBeVisible();
    await page.getByRole('button', { name: 'Compartir contacto Bob' }).click();

    await expect(page.getByText('Tarjeta de contacto').first()).toBeVisible();
    await expect(page.getByText('200:aaaa:bbbb:cccc:dddd:eeee:ffff:0002')).toBeVisible();
});

test('puede reflejar un contacto que pasa a online tras refresco', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Contactos' }).click();
    await page.getByText('Bob').first().click();
    await expect(page.getByText(/Última vez|Desconectado/)).toBeVisible();

    await patchBridgeContact(page, 'bob', {
        status: 'connected',
        lastSeen: new Date().toISOString(),
    });
    await emitBridgeEvent(page, 'onHandshakeFinished', { upeerId: 'bob' });

    await page.getByText('Alice').first().click();
    await page.getByText('Bob').first().click();
    await expect(page.getByText('En línea')).toBeVisible();
});
