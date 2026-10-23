ALTER TABLE `sync_events` ADD `entity_id` text;--> statement-breakpoint
CREATE INDEX `sync_events_entity_idx` ON `sync_events` (`entity_id`,`direction`);