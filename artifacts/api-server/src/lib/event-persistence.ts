import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { calendar_v3 } from "googleapis";

import {
  activityEntriesTable,
  automationJobsTable,
  calendarEventsTable,
  db,
  remindersTable,
  type CalendarEventRecord,
  type ReminderRecord,
} from "@workspace/db";

import {
  getMeetStatus,
  getMeetUrl,
  type EventInput,
  type PreparedReminder,
} from "./calendar-service";

export function deterministicGoogleEventId(accountId: string, idempotencyKey: string): string {
  return createHash("sha256")
    .update(`${accountId}:${idempotencyKey}`)
    .digest("hex");
}

export async function persistGoogleEvent(input: {
  accountId: string;
  eventInput: EventInput;
  googleEvent: calendar_v3.Schema$Event;
  preparedReminders: PreparedReminder[];
  importIdempotencyKey?: string;
}): Promise<{ event: CalendarEventRecord; reminders: ReminderRecord[]; inserted: boolean }> {
  if (!input.googleEvent.id) {
    throw new Error("Google Calendar returned an event without an ID.");
  }

  const eventStart = input.eventInput.startAt;
  const eventEnd = input.eventInput.endAt;
  const meetUrl = getMeetUrl(input.googleEvent);
  const meetStatus = getMeetStatus(input.googleEvent, input.eventInput.createMeet);

  const result = await db.transaction(async (tx) => {
    const [insertedEvent] = await tx
      .insert(calendarEventsTable)
      .values({
        googleAccountId: input.accountId,
        googleEventId: input.googleEvent.id!,
        calendarId: input.eventInput.calendarId,
        title: input.eventInput.title.trim(),
        startAt: eventStart,
        endAt: eventEnd,
        allDay: input.eventInput.allDay,
        timeZone: input.eventInput.timeZone,
        description: input.eventInput.description?.trim() || null,
        guestEmails: input.eventInput.guestEmails.map((email) => email.trim().toLowerCase()),
        repeat: input.eventInput.repeat,
        automationPaused: false,
        meetUrl,
        meetStatus,
        importIdempotencyKey: input.importIdempotencyKey ?? null,
      })
      .onConflictDoNothing()
      .returning();

    const [event] = insertedEvent
      ? [insertedEvent]
      : await tx
          .select()
          .from(calendarEventsTable)
          .where(
            and(
              eq(calendarEventsTable.googleAccountId, input.accountId),
              eq(calendarEventsTable.calendarId, input.eventInput.calendarId),
              eq(calendarEventsTable.googleEventId, input.googleEvent.id!),
            ),
          )
          .limit(1);
    if (!event) throw new Error("Google event could not be saved to the app database.");

    if (insertedEvent) {
      const reminderValues = input.preparedReminders.map((reminder, index) => ({
        googleAccountId: input.accountId,
        eventId: event.id,
        scheduledAt: reminder.scheduledAt,
        method: reminder.method,
        deliveryMode: reminder.deliveryMode,
        configuration: input.eventInput.reminders[index],
        enabled: reminder.enabled,
        status: reminder.enabled ? "scheduled" : "skipped",
      }));
      if (reminderValues.length) {
        const savedReminders = await tx
          .insert(remindersTable)
          .values(reminderValues)
          .onConflictDoNothing()
          .returning();
        for (const reminder of savedReminders) {
          if (reminder.deliveryMode === "gmail" && reminder.enabled) {
            await tx
              .insert(automationJobsTable)
              .values({
                googleAccountId: input.accountId,
                kind: "email_reminder",
                status: "queued",
                eventId: event.id,
                reminderId: reminder.id,
                idempotencyKey: `email-reminder:${reminder.id}`,
                payload: { reminderId: reminder.id },
                scheduledAt: reminder.scheduledAt,
              })
              .onConflictDoNothing();
          }
        }
      }

      if (meetStatus === "pending") {
        await tx
          .insert(automationJobsTable)
          .values({
            googleAccountId: input.accountId,
            kind: "conference_check",
            status: "queued",
            eventId: event.id,
            idempotencyKey: `conference-check:${event.id}`,
            payload: { calendarId: event.calendarId, googleEventId: event.googleEventId },
            scheduledAt: new Date(Date.now() + 15_000),
          })
          .onConflictDoNothing();
      }

      await tx.insert(activityEntriesTable).values({
        googleAccountId: input.accountId,
        kind: "event_created",
        message: `Created “${event.title}” in Google Calendar.`,
        status: "success",
      });
    }

    const savedReminders = await tx
      .select()
      .from(remindersTable)
      .where(eq(remindersTable.eventId, event.id));
    return { event, reminders: savedReminders, inserted: Boolean(insertedEvent) };
  });

  return result;
}

export async function replaceEventReminders(input: {
  accountId: string;
  event: CalendarEventRecord;
  reminders: EventInput["reminders"];
  preparedReminders: PreparedReminder[];
  paused?: boolean;
}): Promise<ReminderRecord[]> {
  return db.transaction(async (tx) => {
    await tx
      .update(automationJobsTable)
      .set({
        status: "completed",
        error: null,
        startedAt: null,
      })
      .where(
        and(
          eq(automationJobsTable.eventId, input.event.id),
          eq(automationJobsTable.kind, "email_reminder"),
          inArray(automationJobsTable.status, ["queued", "failed"]),
        ),
      );
    await tx.delete(remindersTable).where(eq(remindersTable.eventId, input.event.id));
    const values = input.preparedReminders.map((reminder, index) => {
      const enabled = !input.paused && reminder.enabled;
      return {
        googleAccountId: input.accountId,
        eventId: input.event.id,
        scheduledAt: reminder.scheduledAt,
        method: reminder.method,
        deliveryMode: reminder.deliveryMode,
        configuration: input.reminders[index],
        enabled,
        status: enabled ? "scheduled" : "skipped",
      };
    });
    const saved = values.length
      ? await tx.insert(remindersTable).values(values).returning()
      : [];
    for (const reminder of saved) {
      if (reminder.deliveryMode === "gmail" && reminder.enabled) {
        await tx
          .insert(automationJobsTable)
          .values({
            googleAccountId: input.accountId,
            kind: "email_reminder",
            status: "queued",
            eventId: input.event.id,
            reminderId: reminder.id,
            idempotencyKey: `email-reminder:${reminder.id}`,
            payload: { reminderId: reminder.id },
            scheduledAt: reminder.scheduledAt,
          })
          .onConflictDoNothing();
      }
    }
    return saved;
  });
}
