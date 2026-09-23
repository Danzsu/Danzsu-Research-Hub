import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const itemStates = sqliteTable(
  "item_states",
  {
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull(),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isSaved: integer("is_saved", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] })],
);

export const todos = sqliteTable(
  "todos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    itemId: text("item_id"),
    text: text("text").notNull(),
    isDone: integer("is_done", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_todos_user_status_created").on(
      table.userId,
      table.isDone,
      table.createdAt,
    ),
  ],
);
