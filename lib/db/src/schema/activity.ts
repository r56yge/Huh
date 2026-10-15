import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { googleAccountsTable } from "./google-accounts";

export const activityEntriesTable = pgTable(
  "automation_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleAccountId: uuid("google_account_id")
      .notNull()
      .references(() => googleAccountsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("automation_activity_account_created_idx").on(table.googleAccountId, table.createdAt)],
);

export const insertActivityEntrySchema = createInsertSchema(activityEntriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityEntry = z.infer<typeof insertActivityEntrySchema>;
export type ActivityEntryRecord = typeof activityEntriesTable.$inferSelect;
