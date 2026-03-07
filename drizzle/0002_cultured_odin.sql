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
ALTER TABLE `contacts` ADD `renewal_token` text;