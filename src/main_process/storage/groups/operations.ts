import { getDb, getSchema, eq, desc } from '../shared.js';
import { getUPeerIdFromPublicKey } from '../../security/identity.js';

export interface GroupRecord {
    groupId: string;
    name: string;
    adminUpeerId: string;
    members: string[]; // parsed from JSON
    isFavorite?: boolean;
    status: 'active' | 'invited' | 'removed';
    epoch: number;
    senderKey?: string | null;
    senderKeyCreatedAt?: number | null;
    memberPublicKeys?: Record<string, string>;
    avatar?: string | null;
    createdAt?: number | null;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageStatus?: string;
    lastMessageIsMine?: boolean;
}

export interface GroupCryptoState {
    epoch?: number;
    senderKey?: string;
    senderKeyCreatedAt?: number;
}

type GroupRow = Omit<GroupRecord, 'members' | 'memberPublicKeys'> & {
    members: string;
    memberPublicKeys?: string | null;
};

type LastGroupMessageRow = {
    message?: string | null;
    timestamp?: number | string | null;
    status?: string | null;
    isMine?: boolean | null;
};

type GroupInfoUpdate = {
    name?: string;
    avatar?: string | null;
};

type GroupCryptoUpdate = {
    epoch?: number;
    senderKey?: string;
    senderKeyCreatedAt?: number;
};

function parseGroup(raw: GroupRow): GroupRecord {
    let members: string[] = [];
    let memberPublicKeys: Record<string, string> = {};
    try {
        members = JSON.parse(raw.members || '[]');
    } catch {
        members = [];
    }
    try {
        const parsed = JSON.parse(raw.memberPublicKeys || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            memberPublicKeys = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => {
                const [upeerId, publicKey] = entry;
                return members.includes(upeerId)
                    && typeof publicKey === 'string'
                    && /^[0-9a-f]{64}$/i.test(publicKey)
                    && getUPeerIdFromPublicKey(Buffer.from(publicKey, 'hex')) === upeerId;
            }));
        }
    } catch {
        memberPublicKeys = {};
    }
    return {
        ...raw,
        epoch: typeof raw.epoch === 'number' ? raw.epoch : 1,
        senderKey: typeof raw.senderKey === 'string' ? raw.senderKey : null,
        senderKeyCreatedAt: typeof raw.senderKeyCreatedAt === 'number' ? raw.senderKeyCreatedAt : null,
        members,
        memberPublicKeys,
    };
}

export function saveGroup(
    groupId: string,
    name: string,
    adminUpeerId: string,
    members: string[],
    status: 'active' | 'invited' | 'removed' = 'active',
    avatar?: string,
    cryptoState?: GroupCryptoState,
    memberPublicKeys: Record<string, string> = {},
): void {
    const db = getDb();
    const schema = getSchema();
    db.insert(schema.groups).values({
        groupId,
        name,
        adminUpeerId,
        members: JSON.stringify(members),
        memberPublicKeys: JSON.stringify(memberPublicKeys),
        status,
        epoch: cryptoState?.epoch ?? 1,
        ...(cryptoState?.senderKey !== undefined ? { senderKey: cryptoState.senderKey } : {}),
        ...(cryptoState?.senderKeyCreatedAt !== undefined ? { senderKeyCreatedAt: cryptoState.senderKeyCreatedAt } : {}),
        createdAt: Date.now(), // BUG DB-GRP-TS fix: inserción manual de integer
        ...(avatar ? { avatar } : {})
    }).onConflictDoUpdate({
        target: schema.groups.groupId,
        set: {
            name,
            adminUpeerId,
            members: JSON.stringify(members),
            memberPublicKeys: JSON.stringify(memberPublicKeys),
            status,
            ...(cryptoState?.epoch !== undefined ? { epoch: cryptoState.epoch } : {}),
            ...(cryptoState?.senderKey !== undefined ? { senderKey: cryptoState.senderKey } : {}),
            ...(cryptoState?.senderKeyCreatedAt !== undefined ? { senderKeyCreatedAt: cryptoState.senderKeyCreatedAt } : {}),
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
    const set: GroupInfoUpdate = {};
    if (fields.name !== undefined) set.name = fields.name;
    if (fields.avatar !== undefined) set.avatar = fields.avatar;
    if (Object.keys(set).length === 0) return;
    db.update(schema.groups).set(set).where(eq(schema.groups.groupId, groupId)).run();
}

export function getGroups(): GroupRecord[] {
    const db = getDb();
    const schema = getSchema();
    const rawGroups = (db.select().from(schema.groups).all() as GroupRow[]).map(parseGroup);
    const result = rawGroups.map(g => {
        const lastMsgObj = db.select().from(schema.messages)
            .where(eq(schema.messages.chatUpeerId, g.groupId))
            .orderBy(desc(schema.messages.timestamp))
            .limit(1).get() as LastGroupMessageRow | undefined;
        // BUG DB-GRP-TMP fix: el timestamp en schema es integer, no string.
        // El cast a string causaba que el sorting numérico fallara cuando el
        // timestamp era un número grande interpretado como string corto.
        const lastMessageTime = lastMsgObj?.timestamp !== undefined ? Number(lastMsgObj.timestamp) : undefined;
        return {
            ...g,
            lastMessage: lastMsgObj?.message as string | undefined,
            lastMessageTime: lastMessageTime?.toString() ?? undefined,
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
    return result ? parseGroup(result as unknown as GroupRow) : null;
}

export function updateGroupMembers(groupId: string, members: string[]): void {
    const group = getGroupById(groupId);
    const db = getDb();
    const schema = getSchema();
    const memberSet = new Set(members);
    const memberPublicKeys = Object.fromEntries(
        Object.entries(group?.memberPublicKeys ?? {}).filter(([memberId]) => memberSet.has(memberId)),
    );
    db.update(schema.groups)
        .set({ members: JSON.stringify(members), memberPublicKeys: JSON.stringify(memberPublicKeys) })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function mergeGroupMemberPublicKeys(groupId: string, entries: Record<string, string>): void {
    const group = getGroupById(groupId);
    if (!group) return;
    const memberSet = new Set(group.members);
    const memberPublicKeys = { ...(group.memberPublicKeys ?? {}) };
    for (const [upeerId, publicKey] of Object.entries(entries)) {
        if (memberSet.has(upeerId)
            && /^[0-9a-f]{64}$/i.test(publicKey)
            && getUPeerIdFromPublicKey(Buffer.from(publicKey, 'hex')) === upeerId) {
            memberPublicKeys[upeerId] = publicKey.toLowerCase();
        }
    }
    updateGroupMemberPublicKeys(groupId, memberPublicKeys);
}

export function updateGroupMemberPublicKeys(groupId: string, memberPublicKeys: Record<string, string>): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ memberPublicKeys: JSON.stringify(memberPublicKeys) })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function updateGroupCrypto(groupId: string, cryptoState: GroupCryptoState): void {
    const db = getDb();
    const schema = getSchema();
    const set: GroupCryptoUpdate = {};
    if (cryptoState.epoch !== undefined) set.epoch = cryptoState.epoch;
    if (cryptoState.senderKey !== undefined) set.senderKey = cryptoState.senderKey;
    if (cryptoState.senderKeyCreatedAt !== undefined) set.senderKeyCreatedAt = cryptoState.senderKeyCreatedAt;
    if (Object.keys(set).length === 0) return;
    db.update(schema.groups)
        .set(set)
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function updateGroupStatus(groupId: string, status: 'active' | 'invited' | 'removed'): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ status })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function updateGroupAdmin(groupId: string, adminUpeerId: string): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ adminUpeerId })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function setGroupFavorite(groupId: string, isFavorite: boolean): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.groups)
        .set({ isFavorite })
        .where(eq(schema.groups.groupId, groupId))
        .run();
}

export function deleteGroup(groupId: string): void {
    const db = getDb();
    const schema = getSchema();
    db.delete(schema.groups).where(eq(schema.groups.groupId, groupId)).run();
}
