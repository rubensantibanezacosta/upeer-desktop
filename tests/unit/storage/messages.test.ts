import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveMessage, getMessages, updateMessageContent, deleteMessageLocally, deleteMessagesByChatId, getMessageById, saveFileMessage } from '../../../src/main_process/storage/messages/operations.js';
import { updateMessageStatus, getMessageStatus } from '../../../src/main_process/storage/messages/status.js';
import { saveReaction, deleteReaction } from '../../../src/main_process/storage/messages/reactions.js';
import { getDb, getSchema } from '../../../src/main_process/storage/shared.js';

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    eq: (a: any, b: any) => ({ type: 'eq', a, b }),
    lt: (a: any, b: any) => ({ type: 'lt', a, b }),
    desc: (a: any) => ({ type: 'desc', a }),
    and: (...args: any[]) => ({ type: 'and', args }),
    or: (...args: any[]) => ({ type: 'or', args }),
    runTransaction: (fn: any) => fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        updateMessageStatus: vi.fn(actual.updateMessageStatus),
        getMessageStatus: vi.fn(actual.getMessageStatus),
    };
});

describe('Storage - Message Operations', () => {
    const mockDb = {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    };

    const mockSchema = {
        messages: {
            id: 'id',
            chatUpeerId: 'chatUpeerId',
            timestamp: 'timestamp',
            status: 'status',
            message: 'message',
            isEdited: 'isEdited',
            isDeleted: 'isDeleted',
        },
        groups: {
            groupId: 'groupId',
            lastClearedAt: 'lastClearedAt',
        },
        contacts: {
            upeerId: 'upeerId',
            lastClearedAt: 'lastClearedAt',
        },
        reactions: {
            messageId: 'messageId',
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (getDb as any).mockReturnValue(mockDb);
        (getSchema as any).mockReturnValue(mockSchema);
    });

    it('should save a message and handle conflict by updating status', async () => {
        const mockRun = vi.fn().mockReturnValue({ changes: 0 });
        mockDb.insert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        // Mock status update chain
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    run: vi.fn().mockReturnValue({ changes: 1 })
                })
            })
        });

        // Mock getMessageStatus call inside updateMessageStatus
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue(null)
                })
            })
        });

        await saveMessage('msg-1', 'contact-1', true, 'hello');

        expect(mockDb.insert).toHaveBeenCalled();
        expect(updateMessageStatus).toHaveBeenCalledWith('msg-1', 'sent');
    });

    it('should skip saving if message is older than lastClearedAt', async () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue({ lastClearedAt: Date.now() + 1000 })
                })
            })
        });

        const result = await saveMessage('msg-1', 'grp-1', true, 'old-msg', undefined, undefined, 'sent', undefined, Date.now());

        expect(result.changes).toBe(0);
        expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should update message content and mark as edited', async () => {
        const mockRun = vi.fn();
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        await updateMessageContent('msg-1', 'new-content');

        expect(mockDb.update).toHaveBeenCalled();
        const setCall = mockDb.update().set.mock.calls[0][0];
        expect(setCall.message).toBe('new-content');
        expect(setCall.isEdited).toBe(true);
    });

    it('should mark message as deleted locally', async () => {
        const mockRun = vi.fn();
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        await deleteMessageLocally('msg-1');

        expect(mockDb.update).toHaveBeenCalled();
        const setCall = mockDb.update().set.mock.calls[0][0];
        expect(setCall.isDeleted).toBe(true);
        expect(setCall.message).toBe('Mensaje eliminado');
    });

    it('should retrieve messages with their reactions', async () => {
        const mockMessages = [
            { id: 'msg-1', message: 'hello', timestamp: 1000 },
            { id: 'msg-2', message: 'world', timestamp: 2000 }
        ];
        const mockReactions = [
            { messageId: 'msg-1', emoji: '👍' }
        ];

        // Mock select chain for messages
        mockDb.select.mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            all: vi.fn().mockReturnValue(mockMessages)
                        })
                    })
                })
            })
        });

        // Mock select chain for reactions (twice, once per message)
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    all: vi.fn().mockImplementation(() => {
                        // Devuelve reacciones solo para msg-1
                        return mockReactions;
                    })
                })
            })
        });

        const result = await getMessages('contact-1');

        expect(result).toHaveLength(2);
        expect(result[0].reactions).toBeDefined();
        expect(mockDb.select).toHaveBeenCalled();
    });

    it('should update message with signature and version', async () => {
        const mockRun = vi.fn();
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        await updateMessageContent('msg-1', 'updated', 'sig-1', 2);

        expect(mockDb.update).toHaveBeenCalled();
        const setCall = mockDb.update().set.mock.calls[0][0];
        expect(setCall.message).toBe('updated');
        expect(setCall.signature).toBe('sig-1');
        expect(setCall.version).toBe(2);
    });

    it('should save a message with senderUpeerId and replyTo', async () => {
        const mockRun = vi.fn().mockReturnValue({ changes: 1 });
        mockDb.insert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        // Mock check for lastClearedAt (contacts)
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue(null)
                })
            })
        });

        await saveMessage('msg-1', 'contact-1', false, 'hi', 'reply-to-id', 'sig-1', 'delivered', 'sender-1');

        expect(mockDb.insert).toHaveBeenCalled();
        const valuesCall = mockDb.insert().values.mock.calls[0][0];
        expect(valuesCall.senderUpeerId).toBe('sender-1');
        expect(valuesCall.replyTo).toBe('reply-to-id');
        expect(valuesCall.signature).toBe('sig-1');
        expect(valuesCall.status).toBe('delivered');
    });

    it('should save group message and check lastClearedAt for groups', async () => {
        const mockRun = vi.fn().mockReturnValue({ changes: 1 });
        mockDb.insert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        // Mock check for lastClearedAt (groups)
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockImplementation((_condition) => {
                    // Simular que chatUpeerId empieza con grp-
                    return {
                        get: vi.fn().mockReturnValue({ lastClearedAt: 500 })
                    };
                })
            })
        });

        await saveMessage('msg-grp-1', 'grp-1', true, 'group hello', undefined, undefined, 'sent', undefined, 1000);

        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockDb.select().from).toHaveBeenCalledWith(mockSchema.groups);
    });

    it('should save and delete reactions', async () => {
        const mockRun = vi.fn().mockReturnValue({ changes: 1 });

        // Mock check existing (saveReaction line 13: .get())
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue(null)
                })
            })
        });

        mockDb.insert = vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                    run: mockRun
                }),
                run: mockRun
            })
        });

        // Test save
        await saveReaction('msg-1', 'peer-1', '😊');
        expect(mockDb.insert).toHaveBeenCalled();

        // Test delete
        mockDb.delete = vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                run: mockRun
            })
        });

        await deleteReaction('msg-1', 'peer-1', '😊');
        expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should delete all messages in a chat and update lastClearedAt', async () => {
        const mockRun = vi.fn().mockReturnValue({ changes: 1 });

        // Mock get for messages to delete
        mockDb.select = vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    all: vi.fn().mockReturnValue([{ id: 'msg-1' }])
                })
            })
        });

        mockDb.delete = vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                run: mockRun
            })
        });

        mockDb.update = vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        await deleteMessagesByChatId('peer-1');

        expect(mockDb.delete).toHaveBeenCalledTimes(2); // messages and reactions
        expect(mockDb.update).toHaveBeenCalled(); // lastClearedAt
    });

    it('should retrieve a single message by ID', async () => {
        const mockMsg = { id: 'msg-1', message: 'hello' };
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue(mockMsg)
                })
            })
        });

        const result = getMessageById('msg-1');
        expect(result).toEqual(mockMsg);
    });

    it('should save a file message with JSON payload', async () => {
        const mockRun = vi.fn().mockReturnValue({ changes: 1 });
        mockDb.insert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                    run: mockRun
                })
            })
        });

        // Mock check for lastClearedAt
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue(null)
                })
            })
        });

        await saveFileMessage('msg-file-1', 'contact-1', true, 'test.pdf', 'file-123', 1024, 'application/pdf');

        expect(mockDb.insert).toHaveBeenCalled();
        const valuesCall = mockDb.insert().values.mock.calls[0][0];
        const parsedMsg = JSON.parse(valuesCall.message);
        expect(parsedMsg.type).toBe('file');
        expect(parsedMsg.fileName).toBe('test.pdf');
    });

    describe('Message Status Logic', () => {
        it('should update status following precedence', async () => {
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            mockDb.update.mockReturnValue({
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        run: mockRun
                    })
                })
            });

            // 1. mock getMessageStatus to return null (new message)
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue(null)
                    })
                })
            });

            const res1 = await updateMessageStatus('msg1', 'sent');
            expect(res1).toBe(true);

            // 2. mock getMessageStatus to return 'delivered'
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue({ status: 'delivered' })
                    })
                })
            });

            // Try to downgrade to 'vaulted' (1 < 2)
            const res2 = await updateMessageStatus('msg1', 'vaulted');
            expect(res2).toBe(false);

            // Upgrade to 'read' (3 > 2)
            const res3 = await updateMessageStatus('msg1', 'read');
            expect(res3).toBe(true);
        });

        it('should return null when getting status of non-existent message', () => {
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue(null)
                    })
                })
            });

            const status = getMessageStatus('non-existent');
            expect(status).toBeNull();
        });

        it('should return correct status when it exists', () => {
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue({ status: 'delivered' })
                    })
                })
            });

            const status = getMessageStatus('msg1');
            expect(status).toBe('delivered');
        });
    });
});
