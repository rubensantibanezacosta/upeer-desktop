import { getDb, getSchema, eq, desc } from '../shared.js';

export interface GroupRecord {
    groupId: string;
    name: string;
    adminUpeerId: string;
    members: string[]; // parsed from JSON
    status: 'active' | 'invited';
    avatar?: string | null;
    createdAt?: string | null;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageStatus?: string;
    lastMessageIsMine?: boolean;
}

function parseGroup(raw: any): GroupRecord {
    let members: string[] = [];
    try {
        members = JSON.parse(raw.members || '[]');
    } catch {
        members = [];
    }
    return {
        ...raw,
        members
    };
}

export function saveGroup(
    groupId: string,
    name: string,
    adminUpeerId: string,
    members: string[],
    status: 'active' | 'invited' = 'active',
    avatar?: string
): void {
    const db = getDb();
    const schema = getSchema();
    db.insert(schema.groups).values({
        groupId,
        name,
        adminUpeerId,
        members: JSON.stringify(members),
        status,
        createdAt: Date.now(), // BUG DB-GRP-TS fix: inserción manual de integer
        ...(avatar ? { avatar } : {})
    }).onConflictDoUpdate({
        target: schema.groups.groupId,
        set: {
            name,
            adminUpeerId,
            members: JSON.stringify(members),
            status,
            ...(avatar !== undefined ? { avatar } : {})
        }
    }).run();
}

export function updateGroupAvatar(groupId: string, avatar: string): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ avatar })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function updateGroupInfo(groupId: string, fields: { name?: string; avatar?: string | null }): void {
    const db = getDb();
    const schema = getSchema();
    const set: Record<string, any> = {};
    if (fields.name !== undefined) set.name = fields.name;
    if (fields.avatar !== undefined) set.avatar = fields.avatar;
    if (Object.keys(set).length === 0) return;
    db.update(schema.groups).set(set).where(eq(schema.groups.groupId, groupId)).run();
}

export function getGroups(): GroupRecord[] {
    const db = getDb();
    const schema = getSchema();
    const rawGroups = db.select().from(schema.groups).all().map(parseGroup);
    const result = rawGroups.map(g => {
        const lastMsgObj = db.select().from(schema.messages)
            .where(eq(schema.messages.chatUpeerId, g.groupId))
            .orderBy(desc(schema.messages.timestamp))
            .limit(1).get() as any;
        return {
            ...g,
            lastMessage: lastMsgObj?.message as string | undefined,
            lastMessageTime: lastMsgObj?.timestamp as string | undefined,
            lastMessageStatus: lastMsgObj?.status as string | undefined,
            lastMessageIsMine: !!lastMsgObj?.isMine
        };
    });
    result.sort((a, b) => {
        const tA = a.lastMessageTime ? Number(a.lastMessageTime) : 0;
        const tB = b.lastMessageTime ? Number(b.lastMessageTime) : 0;
        return tB - tA;
    });
    return result;
}

export function getGroupById(groupId: string): GroupRecord | null {
    const db = getDb();
    const schema = getSchema();
    const result = db.select().from(schema.groups)
        .where(eq(schema.groups.groupId, groupId))
        .get();
    return result ? parseGroup(result) : null;
}

export function updateGroupMembers(groupId: string, members: string[]): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ members: JSON.stringify(members) })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function updateGroupStatus(groupId: string, status: 'active' | 'invited'): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ status })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function deleteGroup(groupId: string): void {
    const db = getDb();
    const schema = getSchema();
    db.delete(schema.groups).where(eq(schema.groups.groupId, groupId)).run();
}
