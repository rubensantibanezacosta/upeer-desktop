import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Tabla para configuraciones locales de la aplicación
 * No se sincroniza con otros dispositivos por defecto.
 */
export const appSettings = sqliteTable('app_settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON stringified
    updatedAt: integer('updated_at').notNull()
});

export const groups = sqliteTable('groups', {
    groupId: text('group_id').primaryKey(),
    name: text('name').notNull(),
    adminUpeerId: text('admin_upeer_id').notNull(),
    members: text('members').notNull().default('[]'), // JSON array of upeerIds
    status: text('status').notNull().default('active'), // 'active' | 'invited'
    avatar: text('avatar'), // base64 data URL, local only
    createdAt: integer('created_at').notNull(), // Unix ms
    // ── Resiliencia de vaciado de chat (Anti-Zombi) para Grupos ─────────────
    lastClearedAt: integer('last_cleared_at').notNull().default(0), // unix timestamp ms
});

export const messages = sqliteTable('messages', {
    id: text('id').primaryKey(),
    chatUpeerId: text('chat_upeer_id').notNull(),
    senderUpeerId: text('sender_upeer_id'), // Para grupos: quién envió el mensaje
    isMine: integer('is_mine', { mode: 'boolean' }).notNull(),
    message: text('message').notNull(),
    replyTo: text('reply_to'),
    signature: text('signature'),
    status: text('status').notNull().default('sent'),
    version: integer('version').notNull().default(1), // Versión incremental para LWW (Last Write Wins)
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    isEdited: integer('is_edited', { mode: 'boolean' }).notNull().default(false),
    timestamp: integer('timestamp').notNull(), // Unix ms epoch. BUG DB-TS fix: evitar mezcla text/int
});

export const reactions = sqliteTable('reactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id').notNull(),
    upeerId: text('upeer_id').notNull(),
    emoji: text('emoji').notNull(),
    timestamp: integer('timestamp').notNull(), // Unix ms epoch
});

export const contacts = sqliteTable('contacts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    upeerId: text('upeer_id').unique(),
    address: text('address').notNull(),
    name: text('name').notNull(),
    publicKey: text('public_key'),
    ephemeralPublicKey: text('ephemeral_public_key'),
    ephemeralPublicKeyUpdatedAt: text('ephemeral_public_key_updated_at'), // ISO timestamp of last eph key update
    // ── Double Ratchet: Signed PreKey del contacto (X25519) ──────────────────
    // Se recibe en el HANDSHAKE y se usa para X3DH al enviar el primer mensaje ratchet.
    signedPreKey: text('signed_pre_key'),              // hex X25519 public key
    signedPreKeySignature: text('signed_pre_key_sig'), // hex Ed25519 signature de SPK por IK
    signedPreKeyId: integer('signed_pre_key_id'),      // ID correlativo del SPK
    dhtSeq: integer('dht_seq').notNull().default(0),
    dhtSignature: text('dht_signature'),
    dhtExpiresAt: integer('dht_expires_at'),
    renewalToken: text('renewal_token'),
    knownAddresses: text('known_addresses').notNull().default('[]'), // JSON: string[] — one IP per device
    avatar: text('avatar'), // Base64 data URL del avatar, nullable
    status: text('status').notNull().default('connected'), // 'pending'|'incoming'|'connected'|'offline'|'blocked'
    blockedAt: text('blocked_at'), // ISO timestamp cuando fue bloqueado
    lastSeen: text('last_seen').default(sql`CURRENT_TIMESTAMP`),
    // ── Resiliencia de vaciado de chat (Anti-Zombi) ─────────────────────────
    // Registra el timestamp del último vaciado total del chat para ignorar 
    // mensajes antiguos que lleguen vía sincronización/vaults.
    lastClearedAt: integer('last_cleared_at').notNull().default(0), // unix timestamp ms
});

export const backupPulseSync = sqliteTable('backup_pulse_sync', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kitId: text('kit_id').unique().notNull(), // UUID del PulseSync
    name: text('name').notNull(),
    description: text('description'),
    data: text('data').notNull(), // JSON string with contacts and location blocks
    created: text('created').default(sql`CURRENT_TIMESTAMP`),
    expires: integer('expires'), // Timestamp when pulse sync expires
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const vaultStorage = sqliteTable('vault_storage', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    payloadHash: text('payload_hash').unique().notNull(),
    recipientSid: text('recipient_sid').notNull(), // Social ID del destinatario
    senderSid: text('sender_sid').notNull(),    // Social ID del emisor original
    priority: integer('priority').notNull().default(1), // 1: msg, 2: meta, 3: chunk
    data: text('data').notNull(),               // BLOB/Encrypted data (as hex)
    expiresAt: integer('expires_at').notNull(), // TTL (Timestamp)
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
});

export const distributedAssets = sqliteTable('distributed_assets', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fileHash: text('file_hash').notNull(),
    cid: text('cid').unique().notNull(),        // Content ID del fragmento
    segmentIndex: integer('segment_index').notNull().default(0),
    shardIndex: integer('shard_index').notNull(),
    totalShards: integer('total_shards').notNull(),
    custodianSid: text('custodian_sid').notNull(), // Amigo que lo tiene
    status: text('status').notNull().default('active'), // 'active' | 'lost'
    lastVerified: integer('last_verified'),
});

export const redundancyHealth = sqliteTable('redundancy_health', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetHash: text('asset_hash').unique().notNull(),
    availableShards: integer('available_shards').notNull(),
    requiredShards: integer('required_shards').notNull(), // k (datos)
    healthStatus: text('health_status').notNull(), // 'perfect' | 'degraded' | 'critical' | 'lost'
    lastCheck: integer('last_check'),
});

// G-Set CRDT de vouches firmados para reputación distribuida
export const reputationVouches = sqliteTable('reputation_vouches', {
    id: text('id').primaryKey(),                             // sha256 determinista
    fromId: text('from_id').notNull(),                       // upeerId emisor
    toId: text('to_id').notNull(),                           // upeerId sujeto
    type: text('type').notNull(),                            // VouchType
    positive: integer('positive', { mode: 'boolean' }).notNull(),
    timestamp: integer('timestamp').notNull(),               // ms epoch
    signature: text('signature').notNull(),                  // hex Ed25519
    receivedAt: integer('received_at').notNull(),            // cuando lo recibimos
}, (table) => ({
    toIdx: index('rep_vouches_to_idx').on(table.toId),
    fromIdx: index('rep_vouches_from_idx').on(table.fromId),
    tsIdx: index('rep_vouches_ts_idx').on(table.timestamp),
}));

// ── Double Ratchet: estado de sesión por contacto ─────────────────────────────
// Protegido por SQLCipher. Contiene material de clave sensible (dhsSk).
export const ratchetSessions = sqliteTable('ratchet_sessions', {
    upeerId: text('upeer_id').primaryKey(),   // un estado por contacto
    state: text('state').notNull(),                   // JSON SerializedRatchetState
    // Nuestro SPK que se usó para establecer esta sesión (para poder rotar)
    spkIdUsed: integer('spk_id_used'),
    establishedAt: integer('established_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
});

// ── Pending Outbox: mensajes en espera de clave pública del destinatario ───────
// Cuando Alice quiere escribir a Bob pero aún no tiene su clave pública
// (contacto 'pending' que nunca ha conectado), el mensaje se guarda aquí,
// protegido por SQLCipher, hasta que llegue el primer HANDSHAKE de Bob.
// En ese momento se re-cifra con su clave y se vaultea automáticamente.
export const pendingOutbox = sqliteTable('pending_outbox', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    msgId: text('msg_id').notNull(),                // UUID original de saveMessage() — evita duplicados
    recipientSid: text('recipient_sid').notNull(),  // upeerId del destinatario
    plaintext: text('plaintext').notNull(),          // contenido del mensaje (SQLCipher lo protege)
    replyTo: text('reply_to'),                       // id del mensaje al que se responde (opcional)
    createdAt: integer('created_at').notNull(),      // epoch ms
}, (table) => ({
    recipientIdx: index('pending_outbox_recipient_idx').on(table.recipientSid),
}));

/**
 * Tabla para persistir metadatos de dispositivos propios y de contactos.
 * Fundamental para el ruteo multi-dispositivo y la UX de gestión de sesiones.
 */
export const devices = sqliteTable('devices', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    upeerId: text('upeer_id').notNull(),         // Dueño del dispositivo
    deviceId: text('device_id').notNull(),       // ID único persistente del dispositivo
    clientName: text('client_name'),             // Nombre amigable (ej: "Mi Android")
    platform: text('platform'),                  // OS/Platform (linux, darwin, android)
    clientVersion: text('client_version'),       // Versión del cliente
    lastSeen: integer('last_seen').notNull(),    // Unix ms epoch
    isTrusted: integer('is_trusted', { mode: 'boolean' }).notNull().default(true),
}, (table) => ({
    upeerIdx: index('devices_upeer_idx').on(table.upeerId),
    deviceIdx: index('devices_id_idx').on(table.deviceId),
    uniqueConstraint: index('devices_unique_idx').on(table.upeerId, table.deviceId)
}));
