CREATE INDEX `idx_todos_user_status_created` ON `todos` (`user_id`,`is_done`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
