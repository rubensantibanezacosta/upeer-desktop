CREATE TABLE `__new_ratchet_sessions` (
	`upeer_id` text NOT NULL,
	`context_id` text DEFAULT 'direct' NOT NULL,
	`state` text NOT NULL,
	`spk_id_used` integer,
	`established_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`upeer_id`, `context_id`)
);
--> statement-breakpoint
INSERT INTO `__new_ratchet_sessions`("upeer_id", "context_id", "state", "spk_id_used", "established_at", "updated_at") SELECT "upeer_id", 'direct', "state", "spk_id_used", "established_at", "updated_at" FROM `ratchet_sessions`;--> statement-breakpoint
DROP TABLE `ratchet_sessions`;--> statement-breakpoint
ALTER TABLE `__new_ratchet_sessions` RENAME TO `ratchet_sessions`;