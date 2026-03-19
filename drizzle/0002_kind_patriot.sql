CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upeer_id` text NOT NULL,
	`device_id` text NOT NULL,
	`client_name` text,
	`platform` text,
	`client_version` text,
	`last_seen` integer NOT NULL,
	`is_trusted` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devices_upeer_idx` ON `devices` (`upeer_id`);--> statement-breakpoint
CREATE INDEX `devices_id_idx` ON `devices` (`device_id`);--> statement-breakpoint
CREATE INDEX `devices_unique_idx` ON `devices` (`upeer_id`,`device_id`);