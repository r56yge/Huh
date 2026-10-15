import { and, asc, eq, lte, sql } from "drizzle-orm";
import cron from "node-cron";
import { google } from "googleapis";

import {
  activityEntriesTable,
  automationJobsTable,
  calendarEventsTable,
  db,
  googleAccountsTable,
  remindersTable,
} from "@workspace/db";

import { getGoogleClient } from "./google";
import { logger } from "./logger";

const BATCH_SIZE = 8;
const STALE_AFTER_MS = 5 * 60 * 1000;
let polling = false;
let task: ReturnType<typeof cron.schedule> | undefined;

type Job = typeof automationJobsTable.$inferSelect;

function errorMessage(error: unknown): string {
  const candidate = error as { message?: string; response?: { data?: { error?: { message?: string } } } };
  const message = candidate.response?.data?.error?.message ?? candidate.message;
  return (message || "The background operation failed.").slice(0, 1000);
}

async function claimNextJob(): Promise<Job | undefined> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(automationJobsTable)
      .where(
        and(
          eq(automationJobsTable.status, "queued"),
          lte(automationJobsTable.scheduledAt, new Date()),
        ),
      )
      .orderBy(asc(automationJobsTable.scheduledAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) return undefined;

    const [claimed] = await tx
      .update(automationJobsTable)
      .set({
        status: "running",
        startedAt: new Date(),
        attempts: candidate.attempts + 1,
        error: null,
      })
      .where(eq(automationJobsTable.id, candidate.id))
      .returning();

    return claimed;
  });
}

async function finishJob(job: Job, error?: string): Promise<void> {
  await db
    .update(automationJobsTable)
    .set({ status: error ? "failed" : "completed", error: error ?? null, startedAt: null })
    .where(eq(automationJobsTable.id, job.id));

  if (error) {
    await db.insert(activityEntriesTable).values({
      googleAccountId: job.googleAccountId,
      kind: "job_failed",
      message: `${job.kind.replaceAll("_", " ")} failed: ${error}`,
      status: "failed",
    });
  }
}

async function completeSkipped(job: Job, message: string): Promise<void> {
  if (job.reminderId) {
    await db
      .update(remindersTable)
      .set({ enabled: false, status: "skipped", updatedAt: new Date() })
      .where(eq(remindersTable.id, job.reminderId));
  }
  await db
    .update(automationJobsTable)
    .set({ status: "completed", error: message, startedAt: null })
    .where(eq(automationJobsTable.id, job.id));
}

async function processEmailReminder(job: Job): Promise<void> {
  if (!job.reminderId) throw new Error("The reminder job has no reminder record.");
  const [reminder] = await db
    .select()
    .from(remindersTable)
    .where(
      and(
        eq(remindersTable.id, job.reminderId),
        eq(remindersTable.googleAccountId, job.googleAccountId),
      ),
    )
    .limit(1);

  if (!reminder) {
    await completeSkipped(job, "The reminder was removed or replaced.");
    return;
  }

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.id, reminder.eventId),
        eq(calendarEventsTable.googleAccountId, job.googleAccountId),
      ),
    )
    .limit(1);

  if (!event || event.cancelledAt || event.automationPaused || !reminder.enabled || reminder.status !== "scheduled") {
    await completeSkipped(job, "The reminder was disabled, paused, cancelled, or replaced.");
    return;
  }

  if (reminder.scheduledAt.getTime() > Date.now()) {
    await db
      .update(automationJobsTable)
      .set({ status: "queued", scheduledAt: reminder.scheduledAt, startedAt: null })
      .where(eq(automationJobsTable.id, job.id));
    return;
  }

  const [account] = await db
    .select()
    .from(googleAccountsTable)
    .where(eq(googleAccountsTable.id, job.googleAccountId))
    .limit(1);
  if (!account) throw new Error("The Google account connected to this reminder no longer exists.");

  const subject = `Reminder: ${event.title.replace(/[\r\n]+/g, " ").slice(0, 180)}`;
  const subjectEncoded = Buffer.from(subject, "utf8").toString("base64");
  const eventTime = new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: event.timeZone,
  }).format(event.startAt);
  const text = [
    `This is your scheduled reminder for ${event.title}.`,
    "",
    `When: ${eventTime} (${event.timeZone})`,
    event.meetUrl ? `Google Meet: ${event.meetUrl}` : "",
    "",
    "This reminder was sent by Smart Calendar Automation.",
  ]
    .filter(Boolean)
    .join("\r\n");
  const rawMessage = [
    `To: ${account.email}`,
    `Subject: =?UTF-8?B?${subjectEncoded}?=`,
    `X-Smart-Calendar-Reminder-ID: ${reminder.id}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");

  await google.gmail({
    version: "v1",
    auth: await getGoogleClient(account),
  }).users.messages.send({
    userId: "me",
    requestBody: { raw: Buffer.from(rawMessage, "utf8").toString("base64url") },
  });

  await db
    .update(remindersTable)
    .set({
      status: "delivered",
      attempts: reminder.attempts + 1,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(remindersTable.id, reminder.id));
  await db.insert(activityEntriesTable).values({
    googleAccountId: job.googleAccountId,
    kind: "reminder_sent",
    message: `Sent a reminder for “${event.title}” to ${account.email}.`,
    status: "success",
  });
}

async function processConferenceCheck(job: Job): Promise<void> {
  if (!job.eventId) throw new Error("The conference job has no event record.");
  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.id, job.eventId),
        eq(calendarEventsTable.googleAccountId, job.googleAccountId),
      ),
    )
    .limit(1);

  if (!event || event.cancelledAt) {
    await finishJob(job);
    return;
  }

  const [account] = await db
    .select()
    .from(googleAccountsTable)
    .where(eq(googleAccountsTable.id, job.googleAccountId))
    .limit(1);
  if (!account) throw new Error("The Google account connected to this event no longer exists.");

  const calendarId =
    typeof job.payload.calendarId === "string" ? job.payload.calendarId : event.calendarId;
  const googleEventId =
    typeof job.payload.googleEventId === "string" ? job.payload.googleEventId : event.googleEventId;
  const response = await google.calendar({
    version: "v3",
    auth: await getGoogleClient(account),
  }).events.get({ calendarId, eventId: googleEventId });
  const video = response.data.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video" && entry.uri,
  );

  if (video?.uri) {
    await db
      .update(calendarEventsTable)
      .set({ meetUrl: video.uri, meetStatus: "ready", updatedAt: new Date() })
      .where(eq(calendarEventsTable.id, event.id));
    await finishJob(job);
    return;
  }

  if (response.data.conferenceData?.createRequest?.status?.statusCode === "failure" || job.attempts >= 6) {
    const message = "Google Calendar could not finish creating the Meet conference.";
    await db
      .update(calendarEventsTable)
      .set({ meetStatus: "failed", updatedAt: new Date() })
      .where(eq(calendarEventsTable.id, event.id));
    await finishJob(job, message);
    return;
  }

  await db
    .update(calendarEventsTable)
    .set({ meetStatus: "pending", updatedAt: new Date() })
    .where(eq(calendarEventsTable.id, event.id));
  await db
    .update(automationJobsTable)
    .set({
      status: "queued",
      scheduledAt: new Date(Date.now() + Math.min(job.attempts, 4) * 15_000),
      startedAt: null,
    })
    .where(eq(automationJobsTable.id, job.id));
}

async function processJob(job: Job): Promise<void> {
  try {
    if (job.kind === "email_reminder") {
      await processEmailReminder(job);
    } else if (job.kind === "conference_check") {
      await processConferenceCheck(job);
    } else {
      throw new Error(`Unsupported automation job type: ${job.kind}`);
    }

    const [current] = await db
      .select({ status: automationJobsTable.status })
      .from(automationJobsTable)
      .where(eq(automationJobsTable.id, job.id))
      .limit(1);
    if (current?.status === "running") await finishJob(job);
  } catch (error) {
    const message = errorMessage(error);
    logger.error({ jobId: job.id, kind: job.kind, message }, "Automation job failed");
    if (job.kind === "conference_check" && job.eventId) {
      await db
        .update(calendarEventsTable)
        .set({ meetStatus: "failed", updatedAt: new Date() })
        .where(eq(calendarEventsTable.id, job.eventId));
    }
    if (job.reminderId) {
      await db
        .update(remindersTable)
        .set({
          status: "failed",
          attempts: sql`${remindersTable.attempts} + 1`,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(remindersTable.id, job.reminderId));
    }
    await finishJob(job, message);
  }
}

async function recoverStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db
    .select()
    .from(automationJobsTable)
    .where(
      and(
        eq(automationJobsTable.status, "running"),
        lte(automationJobsTable.startedAt, cutoff),
      ),
    )
    .limit(30);

  for (const job of stale) {
    if (job.kind === "email_reminder") {
      const message = "Delivery stopped unexpectedly. Check your inbox before retrying to avoid a duplicate email.";
      if (job.reminderId) {
        await db
          .update(remindersTable)
          .set({
            status: "failed",
            attempts: sql`${remindersTable.attempts} + 1`,
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(remindersTable.id, job.reminderId));
      }
      await finishJob(job, message);
    } else {
      await db
        .update(automationJobsTable)
        .set({
          status: "queued",
          scheduledAt: new Date(),
          startedAt: null,
          error: "Recovered after an interrupted worker run.",
        })
        .where(eq(automationJobsTable.id, job.id));
    }
  }
}

export function startJobRunner(): void {
  if (task) return;
  task = cron.schedule("*/5 * * * * *", async () => {
    if (polling) return;
    polling = true;
    try {
      await recoverStaleJobs();
      for (let index = 0; index < BATCH_SIZE; index += 1) {
        const job = await claimNextJob();
        if (!job) break;
        await processJob(job);
      }
    } catch (error) {
      logger.error({ message: errorMessage(error) }, "Automation worker polling failed");
    } finally {
      polling = false;
    }
  });
  logger.info("Durable automation worker started");
}
