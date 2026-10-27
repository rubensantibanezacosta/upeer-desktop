import { expect, type Page } from '@playwright/test';

export async function openContactInfo(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: `Abrir chat con ${name}` }).first().click();
    const panel = page.getByText('Info. del contacto').first();
    if (await panel.isVisible()) return;
    await page.getByRole('button', { name: `Opciones del chat con ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Info. del contacto' }).click();
    await expect(panel).toBeVisible();
}
