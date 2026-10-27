import { describe, expect, it } from 'vitest';
import { isContactUnread, isGroupUnread } from '../../../../src/utils/chatUnread.js';
import type { Contact, Group } from '../../../../src/types/chat.js';

const contact = (overrides: Partial<Contact> = {}): Contact => ({
    upeerId: 'a'.repeat(64),
    address: '200::1',
    name: 'Ana',
    status: 'connected',
    ...overrides,
});

const group = (overrides: Partial<Group> = {}): Group => ({
    groupId: 'group-1',
    name: 'Equipo',
    adminUpeerId: 'a'.repeat(64),
    members: ['a'.repeat(64)],
    status: 'active',
    ...overrides,
});

describe('chat unread predicates', () => {
    it('marks a contact unread when the last message is incoming and not read', () => {
        expect(isContactUnread(contact({ lastMessage: 'hola', lastMessageIsMine: false, lastMessageStatus: 'delivered' }))).toBe(true);
    });

    it('ignores contacts without messages or with the last message already read', () => {
        expect(isContactUnread(contact())).toBe(false);
        expect(isContactUnread(contact({ lastMessage: 'hola', lastMessageIsMine: false, lastMessageStatus: 'read' }))).toBe(false);
    });

    it('ignores chats whose last message was sent by me', () => {
        expect(isContactUnread(contact({ lastMessage: 'hola', lastMessageIsMine: true }))).toBe(false);
    });

    it('honours the manual unread preference for contacts and groups', () => {
        expect(isContactUnread(contact(), { unread: true })).toBe(true);
        expect(isGroupUnread(group(), { unread: true })).toBe(true);
        expect(isContactUnread(contact({ lastMessage: 'hola', lastMessageStatus: 'read' }), { unread: true })).toBe(true);
    });

    it('marks a group unread under the same rule as a contact', () => {
        expect(isGroupUnread(group({ lastMessage: 'reunión', lastMessageIsMine: false }))).toBe(true);
        expect(isGroupUnread(group({ lastMessage: 'reunión', lastMessageIsMine: false, lastMessageStatus: 'read' }))).toBe(false);
        expect(isGroupUnread(group({ lastMessage: 'reunión', lastMessageIsMine: true }))).toBe(false);
        expect(isGroupUnread(group())).toBe(false);
    });
});
