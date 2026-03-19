CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_pulse_sync` (
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
CREATE UNIQUE INDEX `backup_pulse_sync_kit_id_unique` ON `backup_pulse_sync` (`kit_id`);--> statement-breakpoint
DROP TABLE `backup_survival_kit`;