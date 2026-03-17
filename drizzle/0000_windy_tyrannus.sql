CREATE TABLE `backup_survival_kit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kit_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`data` text NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP,
	`expires` integer,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_survival_kit_kit_id_unique` ON `backup_survival_kit` (`kit_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upeer_id` text,
	`address` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text,
	`ephemeral_public_key` text,
	`ephemeral_public_key_updated_at` text,
	`signed_pre_key` text,
	`signed_pre_key_sig` text,
	`signed_pre_key_id` integer,
	`dht_seq` integer DEFAULT 0 NOT NULL,
	`dht_signature` text,
	`dht_expires_at` integer,
	`renewal_token` text,
	`known_addresses` text DEFAULT '[]' NOT NULL,
	`avatar` text,
	`status` text DEFAULT 'connected' NOT NULL,
	`blocked_at` text,
	`last_seen` text DEFAULT CURRENT_TIMESTAMP,
	`last_cleared_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_upeer_id_unique` ON `contacts` (`upeer_id`);--> statement-breakpoint
CREATE TABLE `distributed_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_hash` text NOT NULL,
	`cid` text NOT NULL,
	`segment_index` integer DEFAULT 0 NOT NULL,
	`shard_index` integer NOT NULL,
	`total_shards` integer NOT NULL,
	`custodian_sid` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_verified` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `distributed_assets_cid_unique` ON `distributed_assets` (`cid`);--> statement-breakpoint
CREATE TABLE `groups` (
	`group_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`admin_upeer_id` text NOT NULL,
	`members` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`avatar` text,
	`created_at` integer NOT NULL,
	`last_cleared_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_upeer_id` text NOT NULL,
	`sender_upeer_id` text,
	`is_mine` integer NOT NULL,
	`message` text NOT NULL,
	`reply_to` text,
	`signature` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`is_edited` integer DEFAULT false NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`msg_id` text NOT NULL,
	`recipient_sid` text NOT NULL,
	`plaintext` text NOT NULL,
	`reply_to` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pending_outbox_recipient_idx` ON `pending_outbox` (`recipient_sid`);--> statement-breakpoint
CREATE TABLE `ratchet_sessions` (
	`upeer_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`spk_id_used` integer,
	`established_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`upeer_id` text NOT NULL,
	`emoji` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redundancy_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_hash` text NOT NULL,
	`available_shards` integer NOT NULL,
	`required_shards` integer NOT NULL,
	`health_status` text NOT NULL,
	`last_check` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redundancy_health_asset_hash_unique` ON `redundancy_health` (`asset_hash`);--> statement-breakpoint
CREATE TABLE `reputation_vouches` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`type` text NOT NULL,
	`positive` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`signature` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rep_vouches_to_idx` ON `reputation_vouches` (`to_id`);--> statement-breakpoint
CREATE INDEX `rep_vouches_from_idx` ON `reputation_vouches` (`from_id`);--> statement-breakpoint
CREATE INDEX `rep_vouches_ts_idx` ON `reputation_vouches` (`timestamp`);--> statement-breakpoint
CREATE TABLE `vault_storage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payload_hash` text NOT NULL,
	`recipient_sid` text NOT NULL,
	`sender_sid` text NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`expires_at` integer NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_storage_payload_hash_unique` ON `vault_storage` (`payload_hash`);