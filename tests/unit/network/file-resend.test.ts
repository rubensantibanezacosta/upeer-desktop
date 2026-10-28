import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resendRequestedFile } from '../../../src/main_process/network/file-transfer/resend.js';
import { findFileEntry } from '../../../src/main_process/storage/messages/operations.js';
import { getGroupById } from '../../../src/main_process/storage/groups/operations.js';

const native = vi.hoisted(() => ({ exists: true }));

vi.mock('node:fs', () => ({
    default: { existsSync: () => native.exists },
    existsSync: () => native.exists,
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    findFileEntry: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    warn: vi.fn(),
}));

const entry = (extra: Record<string, unknown> = {}) => ({
    fileId: 'file-1',
    messageId: 'msg-1',
    chatUpeerId: 'peer-a',
    fileName: 'nota.m4a',
    fileSize: 2048,
    mimeType: 'audio/mp4',
    savedPath: '/home/user/uPeer/nota.m4a',
    thumbnail: 'data:image/jpeg;base64,AAAA',
    caption: undefined,
    isMine: true,
    isVoiceNote: true,
    timestamp: 1700000000000,
    category: 'audio' as const,
    ...extra,
});

function manager() {
    return { startSend: vi.fn(async () => 'nuevo-file-id') };
}

describe('resendRequestedFile', () => {
    beforeEach(() => {
        native.exists = true;
        vi.mocked(findFileEntry).mockReset();
        vi.mocked(getGroupById).mockReset();
    });

    it('reenvía el archivo al contacto que lo pide en un chat individual', async () => {
        vi.mocked(findFileEntry).mockReturnValue(entry() as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-1', messageId: 'msg-movil' });

        expect(target.startSend).toHaveBeenCalledWith(
            'peer-a',
            '2a01::1',
            '/home/user/uPeer/nota.m4a',
            'data:image/jpeg;base64,AAAA',
            undefined,
            true,
            'nota.m4a',
            { chatUpeerId: 'peer-a', persistMessage: false, messageId: 'msg-movil' }
        );
    });

    it('usa el mensaje original cuando la petición no lo identifica', async () => {
        vi.mocked(findFileEntry).mockReturnValue(entry({ fileId: 'file-2' }) as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-2' });

        expect(findFileEntry).toHaveBeenCalledWith('file-2');
        expect(target.startSend).toHaveBeenCalledWith(
            'peer-a',
            '2a01::1',
            '/home/user/uPeer/nota.m4a',
            expect.anything(),
            undefined,
            true,
            'nota.m4a',
            { chatUpeerId: 'peer-a', persistMessage: false, messageId: 'msg-1' }
        );
    });

    it('no reenvía nada cuando el archivo no está en la base de datos', async () => {
        vi.mocked(findFileEntry).mockReturnValue(null);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-3' });

        expect(target.startSend).not.toHaveBeenCalled();
    });

    it('no reenvía a un contacto ajeno a la conversación', async () => {
        vi.mocked(findFileEntry).mockReturnValue(entry() as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-b', '2a01::2', { fileId: 'file-4' });

        expect(target.startSend).not.toHaveBeenCalled();
    });

    it('reenvía dentro de un grupo solo a sus miembros', async () => {
        vi.mocked(findFileEntry).mockReturnValue(entry({ fileId: 'file-5', chatUpeerId: 'grp-1' }) as never);
        vi.mocked(getGroupById).mockReturnValue({
            groupId: 'grp-1',
            status: 'active',
            members: ['peer-a', 'peer-c'],
        } as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-5' });

        expect(target.startSend).toHaveBeenCalledWith(
            'peer-a',
            '2a01::1',
            '/home/user/uPeer/nota.m4a',
            expect.anything(),
            undefined,
            true,
            'nota.m4a',
            { chatUpeerId: 'grp-1', persistMessage: false, messageId: 'msg-1' }
        );
    });

    it('no reenvía a quien no pertenece al grupo', async () => {
        vi.mocked(findFileEntry).mockReturnValue(entry({ chatUpeerId: 'grp-2' }) as never);
        vi.mocked(getGroupById).mockReturnValue({
            groupId: 'grp-2',
            status: 'active',
            members: ['peer-c'],
        } as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-6' });

        expect(target.startSend).not.toHaveBeenCalled();
    });

    it('no reenvía si el fichero ya no está en disco', async () => {
        native.exists = false;
        vi.mocked(findFileEntry).mockReturnValue(entry() as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-7' });

        expect(target.startSend).not.toHaveBeenCalled();
    });

    it('ignora peticiones repetidas del mismo archivo', async () => {
        vi.mocked(findFileEntry).mockReturnValue(entry({ fileId: 'file-8' }) as never);
        const target = manager();

        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-8' });
        await resendRequestedFile.call(target as never, 'peer-a', '2a01::1', { fileId: 'file-8' });

        expect(target.startSend).toHaveBeenCalledTimes(1);
    });
});
