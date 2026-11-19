ALTER TABLE `events` ADD `stored_bytes` integer;--> statement-breakpoint
ALTER TABLE `photos` ADD `stored_bytes` integer DEFAULT 0 NOT NULL;
