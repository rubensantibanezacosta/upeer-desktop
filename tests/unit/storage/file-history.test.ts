import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb, getSchema } from '../../../src/main_process/storage/shared.js';
import { getFileHistory, categorizeFile, getOlderMessages } from '../../../src/main_process/storage/messages/operations.js';

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    eq: (a: unknown, b: unknown) => ({ type: 'eq', column: a, value: b }),
    and: (...args: unknown[]) => ({ type: 'and', args }),
    lt: (a: unknown, b: unknown) => ({ type: 'lt', column: a, value: b }),
    desc: (a: unknown) => ({ type: 'desc', field: a }),
    runTransaction: (task: () => void) => task(),
}));

const buildSelectChain = (rows: unknown[]) => ({
    select: vi.fn(() => ({
        from: vi.fn(() => ({
            where: vi.fn(() => ({
                orderBy: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        all: vi.fn(() => rows),
                    })),
                })),
            })),
        })),
    })),
});

describe('file-history', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const mockDb = { select: vi.fn() };
        const mockSchema = { messages: { id: 'id', isDeleted: 'isDeleted' } };
        vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDb>);
        vi.mocked(getSchema).mockReturnValue(mockSchema as unknown as ReturnType<typeof getSchema>);
    });

    it('extrae archivos de mensajes JSON y clasifica voces como audio', () => {
        const rows = [
            {
                id: 'msg-1',
                chatUpeerId: 'peer-1',
                timestamp: 1700000000000,
                message: JSON.stringify({ type: 'file', fileId: 'file-1', fileName: 'foto.png', fileSize: 2048, mimeType: 'image/png', thumbnail: 'data:image/png;base64,abc' }),
                isMine: true,
                senderUpeerId: null,
            },
            {
                id: 'msg-2',
                chatUpeerId: 'grp-1',
                timestamp: 1700000001000,
                message: JSON.stringify({ type: 'file', fileId: 'file-2', fileName: 'clip.mp4', fileSize: 1048576, mimeType: 'video/mp4', isVoiceNote: true }),
                isMine: false,
                senderUpeerId: 'peer-2',
            },
        ];
        const chainMock = buildSelectChain(rows);
        vi.mocked(getDb).mockReturnValue({ select: chainMock.select } as unknown as ReturnType<typeof getDb>);

        const result = getFileHistory(50);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ fileId: 'file-1', fileName: 'foto.png', category: 'image', isMine: true, thumbnail: 'data:image/png;base64,abc' });
        expect(result[1]).toMatchObject({ fileId: 'file-2', fileName: 'clip.mp4', category: 'audio', isVoiceNote: true, isMine: false, senderUpeerId: 'peer-2' });
    });

    it('ignora JSON corruptos y mensajes no de archivo', () => {
        const rows = [
            {
                id: 'msg-1',
                chatUpeerId: 'peer-1',
                timestamp: 1700000000000,
                message: '{malformado',
                isMine: true,
                senderUpeerId: null,
            },
            {
                id: 'msg-2',
                chatUpeerId: 'peer-1',
                timestamp: 1700000001000,
                message: 'hola normal',
                isMine: true,
                senderUpeerId: null,
            },
        ];
        const chainMock = buildSelectChain(rows);
        vi.mocked(getDb).mockReturnValue({ select: chainMock.select } as unknown as ReturnType<typeof getDb>);

        const result = getFileHistory(10);

        expect(result).toHaveLength(0);
    });

    it('categorizeFile clasifica por MIME y extensión', () => {
        expect(categorizeFile('image/jpeg', 'a.jpg')).toBe('image');
        expect(categorizeFile('video/webm', 'b.webm')).toBe('video');
        expect(categorizeFile('application/octet-stream', 'c.mkv')).toBe('video');
        expect(categorizeFile('audio/ogg', 'd.ogg')).toBe('audio');
        expect(categorizeFile('application/octet-stream', 'e.zip')).toBe('document');
        expect(categorizeFile('application/unknown', 'f.bin')).toBe('other');
    });
});

describe('getOlderMessages', () => {
    const buildOlderChain = (rows: unknown[]) => ({
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            all: vi.fn(() => rows),
                        })),
                    })),
                })),
            })),
        })),
    });

    beforeEach(() => {
        vi.clearAllMocks();
        const mockDb = { select: vi.fn() };
        vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDb>);
        vi.mocked(getSchema).mockReturnValue({ messages: { id: 'id' } } as unknown as ReturnType<typeof getSchema>);
    });

    it('devuelve mensajes anteriores al cursor y respeta el límite', () => {
        const rows = [
            { id: 'msg-2', chatUpeerId: 'peer-1', timestamp: 200, message: 'segundo', isMine: true },
            { id: 'msg-1', chatUpeerId: 'peer-1', timestamp: 100, message: 'primero', isMine: true },
        ];
        const chainMock = buildOlderChain(rows);
        vi.mocked(getDb).mockReturnValue({ select: chainMock.select } as unknown as ReturnType<typeof getDb>);

        const result = getOlderMessages('peer-1', 300, 50);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('msg-2');
        expect(result[1].id).toBe('msg-1');
        expect(chainMock.select).toHaveBeenCalledTimes(1);
    });

    it('ignora mensajes rotos legacy sanitizados', () => {
        const rows = [
            { id: 'msg-broken', chatUpeerId: 'peer-1', timestamp: 150, message: '{malformado', isMine: true },
            { id: 'msg-ok', chatUpeerId: 'peer-1', timestamp: 100, message: 'hola', isMine: true },
        ];
        const chainMock = buildOlderChain(rows);
        const mockDb = {
            select: chainMock.select,
            delete: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })),
        };
        vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDb>);

        const result = getOlderMessages('peer-1', 200);

        expect(result).toHaveLength(2);
    });
});
