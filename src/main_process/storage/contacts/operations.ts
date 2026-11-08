import { getDb, getSchema, eq, desc } from '../shared.js';
import { isYggdrasilAddress } from '../../network/utils.js';
import { emitSyncEvent } from '../sync/eventSink.js';
import { setSettingsClock } from '../sync/settings-sync.js';
import { getAlias, getAvatar, getMyUPeerId } from '../../security/identity.js';
import { getLatestReactionByChat, reactionIsNewer, type LatestReaction } from '../messages/latestReaction.js';
import { actorNamesFrom, buildReactionPreview } from '../messages/reactionActor.js';
import type { Contact, LatestReactionPreview } from '../../../types/chat.js';

type StoredContact = Omit<Contact, 'knownAddresses'> & {
    knownAddresses?: string | null;
    dhtSeq?: number | null;
    dhtSignature?: string | null;
    dhtExpiresAt?: number | null;
    ephemeralPublicKey?: string | null;
    ephemeralPublicKeyUpdatedAt?: string | null;
    deviceId?: string | null;
    devicePublicKey?: string | null;
    deviceCertificate?: string | null;
    deviceSignedPreKey?: string | null;
    deviceSignedPreKeySignature?: string | null;
    deviceSignedPreKeyId?: number | null;
    deviceMeta?: string | null;
    renewalToken?: string | null;
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
};

type MessageSummaryRow = {
    chatUpeerId?: string | null;
    message?: string | null;
    timestamp?: number | string | null;
    isMine?: boolean | null;
    status?: string | null;
};

type ContactWithLastMessage = StoredContact & {
    lastMessage?: string | null;
    lastMessageTime?: number | string | null;
    lastMessageIsMine?: boolean | null;
    lastMessageStatus?: string | null;
    latestReaction?: LatestReactionPreview;
};

const withLatestReaction = (
    entry: ContactWithLastMessage,
    reaction: LatestReaction | undefined,
    actorNames: Map<string, string>
): ContactWithLastMessage => {
    if (!reaction || !reactionIsNewer(reaction, entry.lastMessageTime)) return entry;
    return {
        ...entry,
        lastMessageTime: String(reaction.timestamp),
        latestReaction: buildReactionPreview(reaction, actorNames)
    };
};

export function getContactByUpeerId(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as StoredContact | undefined;
}

export function getContactByAddress(address: string) {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.address, address))
        .get() as StoredContact | undefined;
}

/**
 * Perfiles que se sincronizan a los demás dispositivos de la cuenta.
 *
 * **La dirección viaja aquí**, y eso es el arreglo del 08/11: antes el perfil llevaba solo nombre,
 * avatar, favorito y clave, así que el resto de dispositivos se quedaban **sin dirección** de los
 * contactos. Se veía en el móvil: cuatro contactos, tres con la dirección vacía, y por eso las
 * llamadas a esos contactos no salían nunca (y los mensajes no tenían a dónde ir hasta que el
 * contacto se veía por otra vía).
 *
 * Se envían la principal y las conocidas: un contacto puede estar en varios dispositivos del mismo
 * usuario y el receptor necesita todas para poder ofrecer una llamada en todos ellos.
 */
export function listContactProfiles(): {
    upeerId: string;
    name: string;
    avatar: string | null;
    isFavorite: boolean;
    publicKey: string | null;
    address: string | null;
    knownAddresses: string[];
}[] {
    const db = getDb();
    const schema = getSchema();

    const rows = db.select().from(schema.contacts).all() as StoredContact[];
    const profiles: ReturnType<typeof listContactProfiles> = [];
    for (const row of rows) {
        const upeerId = (row.upeerId ?? '').toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(upeerId)) continue;
        const publicKey = (row.publicKey ?? '').toLowerCase();
        let known: string[] = [];
        try {
            const parsed: unknown = JSON.parse(row.knownAddresses ?? '[]');
            if (Array.isArray(parsed)) known = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
        } catch {
            known = [];
        }
        const primary = typeof row.address === 'string' && row.address.length > 0 ? row.address : null;
        // La principal va primero y sin repetirse en la lista de conocidas.
        const addresses = primary ? [primary, ...known.filter((entry) => entry !== primary)] : known;
        profiles.push({
            upeerId,
            name: row.name ?? '',
            avatar: row.avatar ?? null,
            isFavorite: row.isFavorite === true,
            publicKey: /^[0-9a-f]{64}$/.test(publicKey) ? publicKey : null,
            address: primary,
            knownAddresses: addresses,
        });
    }
    return profiles;
}

export function getContacts() {
    const db = getDb();
    const schema = getSchema();

    const contactsList = db.select().from(schema.contacts).all() as StoredContact[];
    const messageRows = db.select().from(schema.messages)
        .orderBy(desc(schema.messages.timestamp))
        .all() as MessageSummaryRow[];

    const lastMessageByChat = new Map<string, MessageSummaryRow>();
    for (const message of messageRows) {
        if (!message?.chatUpeerId || lastMessageByChat.has(message.chatUpeerId)) continue;
        lastMessageByChat.set(message.chatUpeerId, message);
    }
    const reactionsByChat = getLatestReactionByChat();
    const actorNames = actorNamesFrom(contactsList);

    const result: ContactWithLastMessage[] = contactsList.map(c => {
        const lastMsgObj = lastMessageByChat.get(c.upeerId || '');

        return withLatestReaction({
            ...c,
            lastMessage: lastMsgObj?.message,
            lastMessageTime: lastMsgObj?.timestamp,
            lastMessageIsMine: lastMsgObj?.isMine,
            lastMessageStatus: lastMsgObj?.status
        } as ContactWithLastMessage, reactionsByChat.get(c.upeerId || ''), actorNames);
    });

    const knownUpeerIds = new Set(result.map(contact => contact.upeerId));
    const myUpeerId = getMyUPeerId();
    for (const [chatUpeerId, lastMsgObj] of lastMessageByChat.entries()) {
        if (!chatUpeerId || chatUpeerId.startsWith('grp-') || knownUpeerIds.has(chatUpeerId)) continue;
        const isSelfChat = myUpeerId !== '' && chatUpeerId === myUpeerId;

        result.push(withLatestReaction({
            upeerId: chatUpeerId,
            address: '',
            name: isSelfChat ? (getAlias() || 'Tú') : 'Contacto eliminado',
            avatar: isSelfChat ? getAvatar() : undefined,
            status: 'offline',
            isConversationOnly: true,
            isSelf: isSelfChat,
            lastMessage: lastMsgObj?.message,
            lastMessageTime: lastMsgObj?.timestamp,
            lastMessageIsMine: lastMsgObj?.isMine,
            lastMessageStatus: lastMsgObj?.status
        } as ContactWithLastMessage, reactionsByChat.get(chatUpeerId), actorNames));
    }

    result.sort((a, b) => {
        const tA = a.lastMessageTime ? Number(a.lastMessageTime) : 0;
        const tB = b.lastMessageTime ? Number(b.lastMessageTime) : 0;
        return tB - tA;
    });
    return result;
}

export function addOrUpdateContact(
    upeerId: string,
    address: string,
    name: string,
    publicKey?: string,
    status: 'pending' | 'incoming' | 'connected' | 'offline' = 'connected',
    ephemeralPublicKey?: string,
    dhtSeq?: number,
    dhtSignature?: string,
    dhtExpiresAt?: number,
    addresses?: string[] // Optional array of multiple addresses
) {
    const db = getDb();
    const schema = getSchema();

    // Merge address into knownAddresses when upserting.
    const existing = db.select({ knownAddresses: schema.contacts.knownAddresses })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { knownAddresses: string } | undefined;

    let known: string[] = [];
    try { known = JSON.parse(existing?.knownAddresses ?? '[]'); } catch { known = []; }

    // Solo almacenar direcciones Yggdrasil: las IPs locales no son canales válidos
    const incomingAddresses = (addresses || [address]).filter(isYggdrasilAddress);
    for (const addr of incomingAddresses) {
        const idx = known.indexOf(addr);
        if (idx !== -1) known.splice(idx, 1);
        known.unshift(addr); // Most recent to the front
    }

    // Ensure the designated primary address is at the very front
    const pIdx = known.indexOf(address);
    if (pIdx !== -1) {
        known.splice(pIdx, 1);
        known.unshift(address);
    }

    if (known.length > 20) known = known.slice(0, 20);
    const kAddresses = JSON.stringify(known);

    const now = new Date().toISOString();
    const ephemeralPublicKeyUpdatedAt = ephemeralPublicKey ? now : undefined;

    const valuesToInsert = {
        upeerId,
        address,
        name,
        publicKey,
        ephemeralPublicKey,
        ephemeralPublicKeyUpdatedAt,
        dhtSeq,
        dhtSignature,
        dhtExpiresAt,
        knownAddresses: kAddresses,
        status
    };

    return db.insert(schema.contacts).values(valuesToInsert).onConflictDoUpdate({
        target: schema.contacts.upeerId,
        set: {
            address,
            name,
            publicKey,
            ...(ephemeralPublicKey ? { ephemeralPublicKey, ephemeralPublicKeyUpdatedAt: now } : {}),
            dhtSeq,
            dhtSignature,
            dhtExpiresAt,
            knownAddresses: kAddresses,
            status
        }
    }).run();
}

export function deleteContact(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    return db.delete(schema.contacts).where(eq(schema.contacts.upeerId, upeerId)).run();
}

/**
 * Aplica las direcciones que llegan en un perfil sincronizado de otro dispositivo de la cuenta.
 *
 * El escritorio aprendía la dirección de un contacto **solo** cuando ese contacto le mandaba un paquete
 * (`handlers.ts`: `directContact && contact.address !== rinfo.address`). Con varios dispositivos propios
 * eso no basta: el móvil ve el escritorio, pero el escritorio no ve al móvil, así que la fila del móvil se
 * quedaba con la dirección vacía y desde ahí la sincronización la repartía vacía a todos.
 *
 * Lo que llega de un perfil se fusiona, no se sobrescribe: una dirección que ya funciona no se pierde
 * porque otro dispositivo mande un perfil sin ella, y la principal solo cambia si la nueva es válida.
 */
export function applyContactProfileAddresses(upeerId: string, primary: unknown, known: unknown): boolean {
    const db = getDb();
    const schema = getSchema();
    const existing = db.select({ address: schema.contacts.address, knownAddresses: schema.contacts.knownAddresses })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { address: string | null; knownAddresses: string | null } | undefined;
    if (!existing) return false;
    let previous: string[] = [];
    try {
        const parsed: unknown = JSON.parse(existing.knownAddresses ?? '[]');
        if (Array.isArray(parsed)) previous = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    } catch {
        previous = [];
    }
    const incoming: string[] = [];
    const push = (value: unknown) => {
        if (typeof value !== 'string') return;
        const trimmed = value.trim();
        if (!trimmed || !isYggdrasilAddress(trimmed) || incoming.includes(trimmed)) return;
        incoming.push(trimmed);
    };
    push(primary);
    if (Array.isArray(known)) for (const entry of known) push(entry);
    if (incoming.length === 0) return false;
    // La lista final: la que llegue primero (la principal anunciada), luego lo que ya había.
    const merged = [...incoming];
    for (const address of previous) if (!merged.includes(address)) merged.push(address);
    const currentPrimary = typeof existing.address === 'string' && existing.address.length > 0 ? existing.address : null;
    const nextPrimary = incoming.includes(currentPrimary ?? '') ? currentPrimary : merged[0];
    const nextKnown = JSON.stringify(merged.slice(0, 20));
    if (nextPrimary === currentPrimary && nextKnown === (existing.knownAddresses ?? '[]')) return false;
    const result = db.update(schema.contacts)
        .set({ address: nextPrimary ?? '', knownAddresses: nextKnown, lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    return (result?.changes ?? 0) > 0;
}

export function updateContactName(upeerId: string, name: string) {
    const db = getDb();
    const schema = getSchema();

    const result = db.update(schema.contacts)
        .set({ name })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    if ((result?.changes ?? 0) > 0) emitContactProfile(upeerId);
    return result;
}

export function updateContactAvatar(upeerId: string, avatar: string) {
    const db = getDb();
    const schema = getSchema();

    const result = db.update(schema.contacts)
        .set({ avatar })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    if ((result?.changes ?? 0) > 0) emitContactProfile(upeerId);
    return result;
}

export function setContactFavorite(upeerId: string, isFavorite: boolean) {
    const db = getDb();
    const schema = getSchema();

    const result = db.update(schema.contacts)
        .set({ isFavorite })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    if ((result?.changes ?? 0) > 0) emitContactProfile(upeerId);
    return result;
}

function emitContactProfile(upeerId: string): void {
    const contact = getContactByUpeerId(upeerId) as { name?: string; avatar?: string | null; isFavorite?: boolean; publicKey?: string | null } | undefined;
    if (!contact) return;
    const publicKey = (contact.publicKey ?? '').toLowerCase();
    emitSyncEvent('CONTACT_PROFILE', {
        upeerId,
        name: contact.name ?? '',
        avatar: contact.avatar ?? null,
        isFavorite: contact.isFavorite === true,
        publicKey: /^[0-9a-f]{64}$/.test(publicKey) ? publicKey : null,
    });
}

export function blockContact(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    const result = db.update(schema.contacts)
        .set({ status: 'blocked', blockedAt: new Date().toISOString() })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    if ((result?.changes ?? 0) > 0) emitBlockedState(upeerId, true);
    return result;
}

export function unblockContact(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    const result = db.update(schema.contacts)
        .set({ status: 'incoming', blockedAt: null })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    if ((result?.changes ?? 0) > 0) emitBlockedState(upeerId, false);
    return result;
}

export function applyBlockedFromSync(upeerId: string, blocked: boolean): boolean {
    const db = getDb();
    const schema = getSchema();

    const result = db.update(schema.contacts)
        .set(blocked ? { status: 'blocked', blockedAt: new Date().toISOString() } : { status: 'incoming', blockedAt: null })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
    return (result?.changes ?? 0) > 0;
}

function emitBlockedState(upeerId: string, blocked: boolean): void {
    setSettingsClock(`blocked:${upeerId}`, Date.now());
    emitSyncEvent('SETTINGS_UPDATE', { block: 'blocked', upeerId, blocked });
}

export function getBlockedContacts() {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.status, 'blocked'))
        .all();
}

export function isContactBlocked(upeerId: string): boolean {
    const db = getDb();
    const schema = getSchema();

    const contact = db.select({ status: schema.contacts.status })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { status: string } | undefined;

    return contact?.status === 'blocked';
}