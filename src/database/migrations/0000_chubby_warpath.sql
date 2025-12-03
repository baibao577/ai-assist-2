CREATE TABLE `conversation_states` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`mode` text NOT NULL,
	`context_elements` text NOT NULL,
	`goals` text NOT NULL,
	`last_activity_at` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`status` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domain_data` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`domain_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`data` text NOT NULL,
	`confidence` real DEFAULT 0.8,
	`extracted_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_domain_data_domain` ON `domain_data` (`domain_id`);--> statement-breakpoint
CREATE INDEX `idx_domain_data_user` ON `domain_data` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_domain_data_conversation` ON `domain_data` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_domain_data_extracted` ON `domain_data` (`extracted_at`);--> statement-breakpoint
CREATE TABLE `goal_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`target_value` real NOT NULL,
	`sequence` integer NOT NULL,
	`achieved` integer DEFAULT 0,
	`achieved_at` integer,
	`metadata` text,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_milestones_goal` ON `goal_milestones` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_milestones_sequence` ON `goal_milestones` (`sequence`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`target_value` real,
	`current_value` real DEFAULT 0,
	`baseline_value` real,
	`unit` text,
	`status` text DEFAULT 'active',
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`target_date` integer,
	`completed_at` integer,
	`last_progress_at` integer,
	`metadata` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_goals_user` ON `goals` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_goals_status` ON `goals` (`status`);--> statement-breakpoint
CREATE INDEX `idx_goals_category` ON `goals` (`category`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `progress_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`value` real NOT NULL,
	`notes` text,
	`logged_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`source` text DEFAULT 'manual',
	`conversation_id` text,
	`metadata` text,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_progress_goal` ON `progress_entries` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_progress_logged` ON `progress_entries` (`logged_at`);