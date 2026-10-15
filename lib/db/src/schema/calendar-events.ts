import { createInsertSchema } from "drizzle-zod";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { googleAccountsTable } from "./google-accounts";

export const calendarEventsTable = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleAccountId: uuid("google_account_id")
      .notNull()
      .references(() => googleAccountsTable.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    timeZone: text("time_zone").notNull(),
    description: text("description"),
    guestEmails: jsonb("guest_emails").$type<string[]>().notNull().default([]),
    repeat: text("repeat").notNull().default("none"),
    automationPaused: boolean("automation_paused").notNull().default(false),
    meetUrl: text("meet_url"),
    meetStatus: text("meet_status").notNull().default("not_requested"),
    importIdempotencyKey: text("import_idempotency_key"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_events_google_unique").on(
      table.googleAccountId,
      table.calendarId,
      table.googleEventId,
    ),
    uniqueIndex("calendar_events_import_idempotency_unique").on(
      table.googleAccountId,
      table.importIdempotencyKey,
    ),
    index("calendar_events_account_start_idx").on(table.googleAccountId, table.startAt),
  ],
);

export const insertCalendarEventSchema = createInsertSchema(calendarEventsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEventRecord = typeof calendarEventsTable.$inferSelect;
