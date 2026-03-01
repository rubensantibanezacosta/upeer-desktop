CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`revelnest_id` text,
	`address` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text,
	`ephemeral_public_key` text,
	`dht_seq` integer DEFAULT 0 NOT NULL,
	`dht_signature` text,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_seen` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_revelnest_id_unique` ON `contacts` (`revelnest_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_revelnest_id` text NOT NULL,
	`is_mine` integer NOT NULL,
	`message` text NOT NULL,
	`reply_to` text,
	`signature` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`is_edited` integer DEFAULT false NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`revelnest_id` text NOT NULL,
	`emoji` text NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
