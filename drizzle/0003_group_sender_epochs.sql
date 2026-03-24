ALTER TABLE `groups` ADD COLUMN `epoch` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `sender_key` text;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `sender_key_created_at` integer;