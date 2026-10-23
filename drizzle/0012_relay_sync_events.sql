CREATE TABLE `sync_relay` (
	`event_id` text NOT NULL,
	`target_device_id` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`acked_at` integer,
	PRIMARY KEY(`event_id`, `target_device_id`)
);
--> statement-breakpoint
CREATE INDEX `sync_relay_target_idx` ON `sync_relay` (`target_device_id`,`acked_at`);