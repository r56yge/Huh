import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
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

import { calendarEventsTable } from "./calendar-events";
import { googleAccountsTable } from "./google-accounts";

export const remindersTable = pgTable(
  "calendar_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleAccountId: uuid("google_account_id")
      .notNull()
      .references(() => googleAccountsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEventsTable.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    method: text("method").notNull(),
    deliveryMode: text("delivery_mode").notNull().default("calendar"),
    configuration: jsonb("configuration")
      .$type<{ enabled: boolean; amount: number; unit: string; localTime: string; method: string }>()
      .notNull()
      .default({ enabled: true, amount: 0, unit: "minutes", localTime: "09:00", method: "email" }),
    status: text("status").notNull().default("scheduled"),
    enabled: boolean("enabled").notNull().default(true),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_reminders_event_time_method_unique").on(
      table.eventId,
      table.scheduledAt,
      table.method,
    ),
    index("calendar_reminders_due_idx").on(table.status, table.scheduledAt),
    index("calendar_reminders_account_idx").on(table.googleAccountId, table.scheduledAt),
  ],
);

export const insertReminderSchema = createInsertSchema(remindersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type ReminderRecord = typeof remindersTable.$inferSelect;
