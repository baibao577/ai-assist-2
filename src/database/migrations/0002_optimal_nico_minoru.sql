PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_states` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`domain_id` text NOT NULL,
	`state_type` text NOT NULL,
	`state_data` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_agent_states`("id", "conversation_id", "domain_id", "state_type", "state_data", "created_at", "expires_at", "resolved") SELECT "id", "conversation_id", "domain_id", "state_type", "state_data", "created_at", "expires_at", "resolved" FROM `agent_states`;--> statement-breakpoint
DROP TABLE `agent_states`;--> statement-breakpoint
ALTER TABLE `__new_agent_states` RENAME TO `agent_states`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_agent_states_conversation` ON `agent_states` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_states_domain` ON `agent_states` (`domain_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_states_expires` ON `agent_states` (`expires_at`);