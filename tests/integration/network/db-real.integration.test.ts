import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
    app: {
        isPackaged: false,
        getPath: () => '/tmp',
    },
}));

describe('e2e con base de datos SQLCipher real (requiere Node 23)', () => {
    let dir: string;
    let contactsOps: typeof import('../../../src/main_process/storage/contacts/operations.js');
    let messagesOps: typeof import('../../../src/main_process/storage/messages/operations.js');

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-db-e2e-'));
        const { initDB } = await import('../../../src/main_process/storage/init.js');
        await initDB(dir);
        contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
    });

    afterAll(async () => {
        const { closeDB } = await import('../../../src/main_process/storage/init.js');
        closeDB();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('persiste un contacto real y lo recupera', () => {
        contactsOps.addOrUpdateContact(
            'aa'.repeat(32),
            '200::alice',
            'Alice',
            'aa11'.repeat(16),
            'connected',
            undefined,
            1,
            'sig',
            Date.now() + 100000,
            ['200::alice']
        );

        const contacts = contactsOps.getContacts();
        expect(contacts).toHaveLength(1);
        expect(contacts[0]?.name).toBe('Alice');
        expect(contacts[0]?.status).toBe('connected');
        expect(contacts[0]?.knownAddresses).toContain('200::alice');
    });

    it('persiste un mensaje real y lo recupera por chat', async () => {
        await messagesOps.saveMessage(
            'msg-1',
            'bb'.repeat(32),
            true,
            'mensaje real persistido',
            undefined,
            'sig',
            'sent',
            'self-id',
            Date.now()
        );

        const history = messagesOps.getMessages('bb'.repeat(32));
        expect(history.some((message) => message.id === 'msg-1' && message.message === 'mensaje real persistido')).toBe(true);
    });
});
