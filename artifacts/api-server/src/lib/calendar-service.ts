import { addDays, format, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { google, type calendar_v3 } from "googleapis";
import { z } from "zod";

import {
  CreateEventBody,
  UpdateEventBody,
} from "@workspace/api-zod";
import type {
  CalendarEventRecord,
  GoogleAccount,
  ReminderRecord,
} from "@workspace/db";

import { getGoogleClient } from "./google";

export type EventInput = z.infer<typeof CreateEventBody>;
export type EventUpdate = z.infer<typeof UpdateEventBody>;
export type ReminderInput = EventInput["reminders"][number];

export async function calendarApi(account: GoogleAccount): Promise<calendar_v3.Calendar> {
  return google.calendar({ version: "v3", auth: await getGoogleClient(account) });
}

export function validateEventInput(input: EventInput): string | undefined {
  if (
    !Number.isFinite(input.startAt.getTime()) ||
    !Number.isFinite(input.endAt.getTime())
  ) {
    return "Start and end times must be valid dates.";
  }
  if (input.endAt.getTime() <= input.startAt.getTime()) {
    return "The event end must be after its start.";
  }
  if (input.guestEmails.length > 100) {
    return "An event can have at most 100 guests.";
  }
  if (input.reminders.length > 20) {
    return "An event can have at most 20 reminders.";
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
  } catch {
    return "Choose a valid time zone.";
  }
  for (const reminder of input.reminders) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reminder.localTime)) {
      return "Reminder times must use 24-hour HH:mm format.";
    }
  }
  return undefined;
}

function amountInMinutes(amount: number, unit: ReminderInput["unit"]): number {
  const factor: Record<ReminderInput["unit"], number> = {
    minutes: 1,
    hours: 60,
    days: 1440,
    weeks: 10080,
  };
  return amount * factor[unit];
}

export function calculateReminderTime(
  eventStart: Date,
  timeZone: string,
  reminder: ReminderInput,
): Date {
  if (reminder.unit === "minutes" || reminder.unit === "hours") {
    return new Date(eventStart.getTime() - amountInMinutes(reminder.amount, reminder.unit) * 60_000);
  }
  const eventLocalDate = formatInTimeZone(eventStart, timeZone, "yyyy-MM-dd");
  const eventDateAsUtcNoon = new Date(`${eventLocalDate}T12:00:00.000Z`);
  const daysBefore = reminder.amount * (reminder.unit === "weeks" ? 7 : 1);
  const reminderDate = format(subDays(eventDateAsUtcNoon, daysBefore), "yyyy-MM-dd");
  return fromZonedTime(`${reminderDate}T${reminder.localTime}:00`, timeZone);
}

export type PreparedReminder = {
  scheduledAt: Date;
  method: "email" | "popup";
  deliveryMode: "calendar" | "gmail";
  enabled: boolean;
  minutesBefore: number;
};

export function prepareReminders(
  eventStart: Date,
  timeZone: string,
  reminders: ReminderInput[],
): { rows: PreparedReminder[]; googleOverrides: calendar_v3.Schema$EventReminder[] } {
  let nativeCount = 0;
  const rows: PreparedReminder[] = [];
  const googleOverrides: calendar_v3.Schema$EventReminder[] = [];
  for (const reminder of reminders) {
    const scheduledAt = calculateReminderTime(eventStart, timeZone, reminder);
    const minutesBefore = Math.max(
      0,
      Math.round((eventStart.getTime() - scheduledAt.getTime()) / 60_000),
    );
    const canUseCalendar = minutesBefore <= 40_320 && nativeCount < 5;
    if (!canUseCalendar && reminder.method === "popup") {
      throw new Error(
        "Google Calendar pop-up reminders are limited to five reminders within four weeks of an event.",
      );
    }
    const deliveryMode = canUseCalendar ? "calendar" : "gmail";
    rows.push({
      scheduledAt,
      method: reminder.method,
      deliveryMode,
      enabled: reminder.enabled && scheduledAt.getTime() > Date.now(),
      minutesBefore,
    });
    if (reminder.enabled && canUseCalendar) {
      googleOverrides.push({ method: reminder.method, minutes: minutesBefore });
      nativeCount += 1;
    }
  }
  return { rows, googleOverrides };
}

function localCalendarDate(value: Date, timeZone: string): string {
  return formatInTimeZone(value, timeZone, "yyyy-MM-dd");
}

export function buildGoogleEventPayload(
  input: EventInput,
  options: { googleOverrides: calendar_v3.Schema$EventReminder[]; deterministicId?: string },
): calendar_v3.Schema$Event {
  const start = input.startAt;
  const end = input.endAt;
  const event: calendar_v3.Schema$Event = {
    summary: input.title.trim(),
    description: input.description?.trim() || undefined,
    start: input.allDay
      ? { date: localCalendarDate(input.startAt, input.timeZone), timeZone: input.timeZone }
      : { dateTime: input.startAt.toISOString(), timeZone: input.timeZone },
    end: input.allDay
      ? {
          date:
            localCalendarDate(input.endAt, input.timeZone) ===
              localCalendarDate(input.startAt, input.timeZone) ||
            formatInTimeZone(end, input.timeZone, "HH:mm") !== "00:00"
              ? format(addDays(new Date(`${localCalendarDate(input.endAt, input.timeZone)}T12:00:00.000Z`), 1), "yyyy-MM-dd")
              : localCalendarDate(input.endAt, input.timeZone),
          timeZone: input.timeZone,
        }
      : { dateTime: input.endAt.toISOString(), timeZone: input.timeZone },
    attendees: input.guestEmails.map((email) => ({ email: email.trim().toLowerCase() })),
    reminders: { useDefault: false, overrides: options.googleOverrides },
    ...(input.repeat !== "none"
      ? { recurrence: [`RRULE:FREQ=${input.repeat.toUpperCase()}`] }
      : {}),
    ...(input.createMeet
      ? {
          conferenceData: {
            createRequest: {
              requestId: options.deterministicId ?? cryptoRandomId(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
    ...(options.deterministicId ? { id: options.deterministicId } : {}),
  };
  return event;
}

function cryptoRandomId(): string {
  return globalThis.crypto.randomUUID();
}

export function getMeetUrl(event: calendar_v3.Schema$Event | undefined): string | null {
  const entry = event?.conferenceData?.entryPoints?.find(
    (candidate) => candidate.entryPointType === "video" && candidate.uri,
  );
  return entry?.uri ?? null;
}

export function getMeetStatus(
  event: calendar_v3.Schema$Event | undefined,
  requested: boolean,
): string {
  if (!requested) return "not_requested";
  if (getMeetUrl(event)) return "ready";
  if (event?.conferenceData?.createRequest?.status?.statusCode === "failure") return "failed";
  return "pending";
}

export function mapStoredEvent(
  event: CalendarEventRecord,
  reminders: ReminderRecord[],
): Record<string, unknown> {
  return {
    id: event.id,
    googleEventId: event.googleEventId,
    title: event.title,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    allDay: event.allDay,
    timeZone: event.timeZone,
    description: event.description,
    guestEmails: event.guestEmails,
    calendarId: event.calendarId,
    repeat: event.repeat,
    automationPaused: event.automationPaused,
    meetUrl: event.meetUrl,
    reminders: reminders.map((reminder) => mapReminder(reminder, event.title)),
  };
}

export function mapReminder(reminder: ReminderRecord, eventTitle: string): Record<string, unknown> {
  return {
    id: reminder.id,
    eventId: reminder.eventId,
    eventTitle,
    scheduledAt: reminder.scheduledAt.toISOString(),
    method: reminder.method,
    status: reminder.status,
    enabled: reminder.enabled,
    attempts: reminder.attempts,
    lastError: reminder.lastError,
  };
}

export function recurrenceFrequency(event: calendar_v3.Schema$Event): string {
  const recurrence = event.recurrence?.join(" ") ?? "";
  const match = recurrence.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
  return match ? match[1].toLowerCase() : "none";
}

export function googleEventToDto(
  event: calendar_v3.Schema$Event,
  calendarId: string,
  local: CalendarEventRecord | undefined,
  reminders: ReminderRecord[],
): Record<string, unknown> | undefined {
  if (!event.id) return undefined;
  const startValue = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00.000Z` : undefined);
  const endValue = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T00:00:00.000Z` : undefined);
  if (!startValue || !endValue) return undefined;
  const title = event.summary ?? "(Untitled event)";
  return {
    id: local?.id ?? event.id,
    googleEventId: event.id,
    title,
    startAt: new Date(startValue).toISOString(),
    endAt: new Date(endValue).toISOString(),
    allDay: Boolean(event.start?.date),
    timeZone: event.start?.timeZone ?? local?.timeZone ?? "UTC",
    description: event.description ?? null,
    guestEmails: (event.attendees ?? [])
      .map((attendee) => attendee.email)
      .filter((email): email is string => Boolean(email)),
    calendarId,
    repeat: local?.repeat ?? recurrenceFrequency(event),
    automationPaused: local?.automationPaused ?? false,
    meetUrl: local?.meetUrl ?? getMeetUrl(event),
    reminders: reminders.map((reminder) => mapReminder(reminder, title)),
  };
}

export function toDateOrNow(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}
