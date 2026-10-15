import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appSessionsTable = pgTable(
  "app_sessions",
  {
    sid: text("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("app_sessions_expire_idx").on(table.expire)],
);
