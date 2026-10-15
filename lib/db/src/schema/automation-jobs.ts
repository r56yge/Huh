import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { googleAccountsTable } from "./google-accounts";

export const automationJobsTable = pgTable(
  "automation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleAccountId: uuid("google_account_id")
      .notNull()
      .references(() => googleAccountsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    eventId: uuid("event_id"),
    reminderId: uuid("reminder_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("automation_jobs_account_key_unique").on(
      table.googleAccountId,
      table.idempotencyKey,
    ),
    index("automation_jobs_due_idx").on(table.status, table.scheduledAt),
    index("automation_jobs_account_created_idx").on(table.googleAccountId, table.createdAt),
  ],
);

export const insertAutomationJobSchema = createInsertSchema(automationJobsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAutomationJob = z.infer<typeof insertAutomationJobSchema>;
export type AutomationJobRecord = typeof automationJobsTable.$inferSelect;
