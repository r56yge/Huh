import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const googleAccountsTable = pgTable("google_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  encryptedTokens: text("encrypted_tokens").notNull(),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoogleAccountSchema = createInsertSchema(googleAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoogleAccount = z.infer<typeof insertGoogleAccountSchema>;
export type GoogleAccount = typeof googleAccountsTable.$inferSelect;
