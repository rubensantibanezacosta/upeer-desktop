CREATE TABLE `sync_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`origin_device_id` text NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`direction` text NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_events_origin_idx` ON `sync_events` (`origin_device_id`);--> statement-breakpoint
CREATE INDEX `sync_events_occurred_idx` ON `sync_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `sync_peers` (
	`device_id` text PRIMARY KEY NOT NULL,
	`upeer_id` text NOT NULL,
	`device_public_key` text NOT NULL,
	`device_certificate` text NOT NULL,
	`device_signed_pre_key` text NOT NULL,
	`device_signed_pre_key_sig` text NOT NULL,
	`device_signed_pre_key_id` integer NOT NULL,
	`address` text,
	`last_seen` integer NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`ack_sequence` integer DEFAULT 0 NOT NULL,
	`history_cursor` text,
	`history_completed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_peers_upeer_idx` ON `sync_peers` (`upeer_id`);