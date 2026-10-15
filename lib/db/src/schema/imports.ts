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

import { calendarEventsTable } from "./calendar-events";
import { googleAccountsTable } from "./google-accounts";

export const importBatchesTable = pgTable(
  "calendar_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleAccountId: uuid("google_account_id")
      .notNull()
      .references(() => googleAccountsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("previewed"),
    totalRows: integer("total_rows").notNull().default(0),
    successfulRows: integer("successful_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (table) => [
    index("calendar_import_batches_account_created_idx").on(
      table.googleAccountId,
      table.createdAt,
    ),
  ],
);

export const importRowsTable = pgTable(
  "calendar_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatchesTable.id, { onDelete: "cascade" }),
    googleAccountId: uuid("google_account_id")
      .notNull()
      .references(() => googleAccountsTable.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("valid"),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
    eventId: uuid("event_id").references(() => calendarEventsTable.id, { onDelete: "set null" }),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_import_rows_batch_row_unique").on(table.batchId, table.rowNumber),
    uniqueIndex("calendar_import_rows_account_idempotency_unique").on(
      table.googleAccountId,
      table.idempotencyKey,
    ),
    index("calendar_import_rows_batch_status_idx").on(table.batchId, table.status),
  ],
);

export const insertImportBatchSchema = createInsertSchema(importBatchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportBatchRecord = typeof importBatchesTable.$inferSelect;

export const insertImportRowSchema = createInsertSchema(importRowsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertImportRow = z.infer<typeof insertImportRowSchema>;
export type ImportRowRecord = typeof importRowsTable.$inferSelect;
