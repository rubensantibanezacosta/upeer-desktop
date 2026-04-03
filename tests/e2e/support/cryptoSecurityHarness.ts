import { expect, type Page } from '@playwright/test';

import { installUpeerBridge } from './upeerBridge.js';

const now = Date.now();

export const defaultMnemonic = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu';

type PinHarnessConfig = {
    enabled?: boolean;
    pin?: string;
    mnemonic?: string;
};

type IdentityHarnessConfig = {
    locked?: boolean;
    mnemonicMode?: boolean;
    mnemonic?: string;
};

type LocalActionHarnessConfig = {
    confirmResponse?: boolean;
};

export async function installPinHarness(page: Page, config: PinHarnessConfig = {}) {
    await page.addInitScript((pinConfig: PinHarnessConfig) => {
        const state = {
            enabled: pinConfig.enabled ?? false,
            pin: pinConfig.pin ?? '2468',
            mnemonic: pinConfig.mnemonic ?? 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
        };
        const patchBridge = () => {
            if (!('upeer' in window)) {
                queueMicrotask(patchBridge);
                return;
            }
            window.upeer.isPinEnabled = async () => state.enabled;
            window.upeer.setPin = async ({ newPin }) => {
                state.pin = newPin;
                state.enabled = true;
                return { success: true };
            };
            window.upeer.disablePin = async ({ pin }) => pin !== state.pin ? { success: false, error: 'PIN incorrecto' } : (state.enabled = false, { success: true });
            window.upeer.verifyPin = async ({ pin }) => pin === state.pin;
            window.upeer.getMnemonic = async (pin) => !state.enabled || pin !== state.pin ? { success: false, error: 'PIN incorrecto' } : { success: true, mnemonic: state.mnemonic };
            window.upeer.lockSession = async () => ({ success: true });
            window.upeer.deleteIdentity = async () => ({ success: true });
        };
        patchBridge();
    }, config);
}

export async function installIdentityHarness(page: Page, config: IdentityHarnessConfig = {}) {
    await page.addInitScript((identityConfig: IdentityHarnessConfig) => {
        const state = {
            locked: identityConfig.locked ?? false,
            mnemonicMode: identityConfig.mnemonicMode ?? false,
            mnemonic: identityConfig.mnemonic ?? 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
        };
        const patchBridge = () => {
            if (!('upeer' in window)) {
                queueMicrotask(patchBridge);
                return;
            }
            window.upeer.identityStatus = async () => ({ isLocked: state.locked, isMnemonicMode: state.mnemonicMode, upeerId: state.locked ? null : 'self-id' });
            window.upeer.generateMnemonic = async () => ({ mnemonic: state.mnemonic });
            window.upeer.createMnemonicIdentity = async (mnemonic, alias) => {
                if (mnemonic !== state.mnemonic) {
                    return { success: false, error: 'invalid_mnemonic' };
                }
                state.locked = false;
                state.mnemonicMode = true;
                if (alias) {
                    window.upeer.getMyIdentity = async () => ({ address: '200:1111:2222:3333:4444:5555:6666:7777', upeerId: 'self-id', publicKey: 'self-public-key', alias, name: alias });
                }
                return { success: true, upeerId: 'self-id' };
            };
            window.upeer.unlockSession = async (mnemonic) => {
                if (mnemonic !== state.mnemonic) {
                    return { success: false, error: 'invalid_mnemonic' };
                }
                state.locked = false;
                state.mnemonicMode = true;
                return { success: true, upeerId: 'self-id' };
            };
            window.upeer.lockSession = async () => {
                state.locked = true;
                state.mnemonicMode = false;
                return { success: true };
            };
        };
        patchBridge();
    }, config);
}

export async function installLocalActionHarness(page: Page, config: LocalActionHarnessConfig = {}) {
    await page.addInitScript((localConfig: LocalActionHarnessConfig) => {
        const storageKey = '__crypto-delete-count';
        window.confirm = () => localConfig.confirmResponse ?? true;
        Storage.prototype.setItem.call(window.sessionStorage, storageKey, Storage.prototype.getItem.call(window.sessionStorage, storageKey) ?? '0');
        const patchBridge = () => {
            if (!('upeer' in window)) {
                queueMicrotask(patchBridge);
                return;
            }
            window.upeer.deleteIdentity = async () => {
                const current = Number(Storage.prototype.getItem.call(window.sessionStorage, storageKey) ?? '0');
                Storage.prototype.setItem.call(window.sessionStorage, storageKey, String(current + 1));
                return { success: true };
            };
            window.location.reload = () => undefined;
        };
        patchBridge();
    }, config);
}

export async function readDeleteCount(page: Page) {
    return page.evaluate(() => Number(window.sessionStorage.getItem('__crypto-delete-count') ?? '0'));
}

export async function mount(
    page: Page,
    scenario: Parameters<typeof installUpeerBridge>[1],
    options?: { pin?: PinHarnessConfig; identity?: IdentityHarnessConfig; localActions?: LocalActionHarnessConfig },
) {
    await installUpeerBridge(page, scenario);
    if (options?.pin) await installPinHarness(page, options.pin);
    if (options?.identity) await installIdentityHarness(page, options.identity);
    if (options?.localActions) await installLocalActionHarness(page, options.localActions);
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeAttached();
}

export function baseScenario(): Parameters<typeof installUpeerBridge>[1] {
    return {
        myIdentity: { upeerId: 'self-id', name: 'Yo', alias: 'Yo' },
        contacts: [
            { upeerId: 'alice', name: 'Alice', address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0001', status: 'connected', publicKey: 'alice-pk', lastSeen: new Date(now).toISOString(), lastMessage: 'Hola', lastMessageTime: new Date(now).toISOString(), vouchScore: 82 },
            { upeerId: 'eve', name: 'Eve', address: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:0009', status: 'incoming', publicKey: 'eve-pk', lastSeen: new Date(now).toISOString(), lastMessage: '', lastMessageTime: null, vouchScore: 15 },
        ],
        groups: [],
        messagesByChat: {
            alice: [{ id: 'alice-1', upeerId: 'alice', message: 'Hola desde Alice', isMine: false, status: 'delivered', timestamp: now - 60_000 }],
            eve: [],
        },
        identityStatus: { isLocked: false },
    };
}

export async function openSecuritySettings(page: Page) {
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: /Seguridad/ }).click();
    await expect(page.getByText('Protección de cuenta', { exact: true })).toBeVisible();
}

export async function fillPinInputs(page: Page, pin: string) {
    const inputs = page.locator('input[type="password"]');
    for (const [index, digit] of pin.split('').entries()) {
        await inputs.nth(index).fill(digit);
    }
}