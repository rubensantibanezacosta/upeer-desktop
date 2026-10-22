ALTER TABLE `contacts` ADD `device_public_key` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `device_id` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `device_certificate` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `device_signed_pre_key` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `device_signed_pre_key_sig` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `device_signed_pre_key_id` integer;
