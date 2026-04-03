import { expect, test } from '@playwright/test';

import { emitBridgeEvent } from './support/upeerBridge.js';
import { baseScenario, defaultMnemonic, fillPinInputs, mount, openSecuritySettings, readDeleteCount } from './support/cryptoSecurityHarness.js';

test('muestra advertencia fuerte para solicitudes no confiables', async ({ page }) => {
    await mount(page, baseScenario());

    await emitBridgeEvent(page, 'onContactRequest', {
        upeerId: 'eve',
        publicKey: 'eve-pk',
        avatar: undefined,
        vouchScore: 15,
    });
    await emitBridgeEvent(page, 'onContactUntrustworthy', {
        upeerId: 'eve',
        address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0009',
        alias: 'Eve',
        reason: 'low_reputation',
    });
    await emitBridgeEvent(page, 'onFocusConversation', { upeerId: 'eve' });

    await expect(page.getByRole('heading', { name: 'Solicitud de Contacto' })).toBeVisible();
    await expect(page.getByText('¡Peligro! Reputación Negativa')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceptar con Precaución' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bloquear' })).toBeVisible();
});

test('enseña y permite descartar alertas de cambio de clave', async ({ page }) => {
    await mount(page, baseScenario());

    await page.getByRole('button', { name: 'Abrir chat con Alice' }).click();
    await emitBridgeEvent(page, 'onKeyChangeAlert', {
        upeerId: 'alice',
        alias: 'Alice',
        oldFingerprint: 'OLD-FPR-1234',
        newFingerprint: 'NEW-FPR-9876',
    });

    await expect(page.getByText('Cambio de clave detectado')).toBeVisible();
    await expect(page.getByText('Huella anterior: OLD-FPR-1234')).toBeVisible();
    await expect(page.getByText('Huella nueva: NEW-FPR-9876')).toBeVisible();
    await page.getByRole('button', { name: 'Entendido' }).click();
    await expect(page.getByText('Cambio de clave detectado')).toHaveCount(0);
});

test('permite activar PIN, revelar semilla y desactivar PIN', async ({ page }) => {
    await mount(page, baseScenario(), { pin: { enabled: false, pin: '2468', mnemonic: defaultMnemonic } });

    await openSecuritySettings(page);
    await expect(page.getByText('Activa el PIN para evitar que otros accedan a tus mensajes en este equipo.')).toBeVisible();

    await page.getByText('Bloqueo con PIN').click();
    await expect(page.getByText('Configurar PIN')).toBeVisible();
    await fillPinInputs(page, '2468');
    await expect(page.getByText('Tu aplicación está protegida con PIN local.')).toBeVisible();

    await page.getByRole('button', { name: 'Revelar mis palabras clave' }).click();
    await expect(page.getByText('Tus Palabras Clave')).toBeVisible();
    await fillPinInputs(page, '2468');
    await expect(page.getByText('alpha')).toBeVisible();
    await expect(page.getByText('lambda')).toBeVisible();
    await page.getByRole('button', { name: 'He guardado las frases' }).click();
    await expect(page.getByText('Tus Palabras Clave')).toHaveCount(0);

    await page.getByText('Bloqueo con PIN').click();
    await expect(page.getByText('Deshabilitar PIN')).toBeVisible();
    await fillPinInputs(page, '2468');
    await expect(page.getByText('Activa el PIN para evitar que otros accedan a tus mensajes en este equipo.')).toBeVisible();
});

test('bloquea la app al arrancar si el PIN está activado y permite desbloquear', async ({ page }) => {
    await mount(page, baseScenario(), { pin: { enabled: true, pin: '2468', mnemonic: defaultMnemonic } });

    await expect(page.getByText('Introduce tu PIN de acceso para continuar')).toBeVisible();
    await fillPinInputs(page, '1111');
    await expect(page.getByText('PIN incorrecto. Te quedan 9 intentos.')).toBeVisible();

    await fillPinInputs(page, '2468');
    await expect(page.getByText('Introduce tu PIN de acceso para continuar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir chat con Alice' })).toBeVisible();
});

test('avisa cuando quedan pocos intentos de PIN', async ({ page }) => {
    await mount(page, baseScenario(), { pin: { enabled: true, pin: '2468', mnemonic: defaultMnemonic } });

    for (const remainingAttempts of [9, 8, 7, 6, 5]) {
        await fillPinInputs(page, '1111');
        await expect(page.getByText(`PIN incorrecto. Te quedan ${remainingAttempts} intentos.`)).toBeVisible();
    }

    await expect(page.getByText('Intentos restantes: 5')).toBeVisible();
    await expect(page.getByText('Atención: te quedan 5 intentos o menos antes de volver al login.')).toBeVisible();
});

test('exige habilitar PIN antes de revelar la frase semilla', async ({ page }) => {
    await mount(page, baseScenario(), { pin: { enabled: false, pin: '2468', mnemonic: defaultMnemonic } });

    await openSecuritySettings(page);
    await page.getByRole('button', { name: 'Revelar mis palabras clave' }).click();
    await expect(page.getByText('Debes habilitar un PIN de acceso primero para ver tus palabras clave.')).toBeVisible();
});

test('crea una identidad nueva desde la frase semilla y entra en la app', async ({ page }) => {
    await mount(page, baseScenario(), { identity: { locked: true, mnemonicMode: false, mnemonic: defaultMnemonic } });

    await page.getByRole('button', { name: 'Crear cuenta nueva' }).click();
    await page.getByRole('button', { name: 'Generar mis 12 palabras' }).click();
    await page.getByRole('button', { name: 'Mostrar palabras' }).click();
    await expect(page.getByText('alpha')).toBeVisible();
    await page.getByRole('button', { name: 'Ya las guardé' }).click();
    await page.getByPlaceholder('Escribe aquí tus 12 palabras en orden').fill(defaultMnemonic);
    await page.getByPlaceholder('Cómo quieres que te vean tus contactos').fill('Rubén');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await expect(page.getByRole('button', { name: 'Abrir chat con Alice' })).toBeVisible();
});

test('permite recuperar o desbloquear la identidad solo con la frase semilla correcta', async ({ page }) => {
    await mount(page, baseScenario(), { identity: { locked: true, mnemonicMode: true, mnemonic: defaultMnemonic } });

    await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
    await page.getByPlaceholder('palabra1 palabra2 palabra3 ... palabra12').fill('uno dos tres cuatro cinco seis siete ocho nueve diez once doce');
    await page.getByRole('button', { name: 'Desbloquear sesión' }).click();
    await expect(page.getByText('Las palabras no son correctas. Comprueba que estén completas y en orden.')).toBeVisible();
    await page.getByPlaceholder('palabra1 palabra2 palabra3 ... palabra12').fill(defaultMnemonic);
    await page.getByRole('button', { name: 'Desbloquear sesión' }).click();
    await expect(page.getByRole('button', { name: 'Abrir chat con Alice' })).toBeVisible();
});

test('muestra error al introducir un PIN incorrecto para revelar la semilla', async ({ page }) => {
    await mount(page, baseScenario(), { pin: { enabled: true, pin: '2468', mnemonic: defaultMnemonic } });

    await fillPinInputs(page, '2468');
    await expect(page.getByText('Introduce tu PIN de acceso para continuar')).toHaveCount(0);
    await openSecuritySettings(page);
    await page.getByRole('button', { name: 'Revelar mis palabras clave' }).click();
    await fillPinInputs(page, '1111');
    await expect(page.getByText('PIN incorrecto')).toBeVisible();
    await expect(page.getByText('alpha')).toHaveCount(0);
});

test('protege el borrado local y solo elimina con el PIN correcto', async ({ page }) => {
    await mount(page, baseScenario(), {
        pin: { enabled: true, pin: '2468', mnemonic: defaultMnemonic },
        localActions: { confirmResponse: true },
    });

    await fillPinInputs(page, '2468');
    await expect(page.getByText('Introduce tu PIN de acceso para continuar')).toHaveCount(0);
    await openSecuritySettings(page);
    await page.getByRole('button', { name: 'Eliminar cuenta y datos locales' }).click();
    await fillPinInputs(page, '1111');
    await expect(page.getByText('PIN incorrecto')).toBeVisible();
    await expect(await readDeleteCount(page)).toBe(0);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Eliminar cuenta y datos locales' }).click();
    await fillPinInputs(page, '2468');
    await expect.poll(async () => {
        try {
            return await readDeleteCount(page);
        } catch {
            return -1;
        }
    }).toBe(1);
});

test('cierra la sesión local y muestra el flujo para cambiar o recuperar identidad', async ({ page }) => {
    await mount(page, baseScenario(), { identity: { locked: false, mnemonicMode: true, mnemonic: defaultMnemonic } });

    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByText('Crea una cuenta solo tuya')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crear cuenta nueva' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ya tengo una cuenta' })).toBeVisible();
});

test('permite borrar la identidad local desde AppLock para usar otra cuenta', async ({ page }) => {
    await mount(page, baseScenario(), {
        pin: { enabled: true, pin: '2468', mnemonic: defaultMnemonic },
        localActions: { confirmResponse: true },
    });

    await page.getByRole('button', { name: 'Iniciar sesión con otra cuenta' }).click();
    await expect.poll(async () => {
        try {
            return await readDeleteCount(page);
        } catch {
            return -1;
        }
    }).toBe(1);
});
