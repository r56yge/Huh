import { and, asc, count, desc, eq, gte, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";

import {
  activityEntriesTable,
  automationJobsTable,
  calendarEventsTable,
  db,
  remindersTable,
  type GoogleAccount,
} from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";

import { requireGoogleAccount } from "../middlewares/google-account";
import { loadEventDtos } from "./calendar";
import { mapReminder } from "../lib/calendar-service";

const router: IRouter = Router();
router.use(requireGoogleAccount);

function accountFrom(req: Request): GoogleAccount {
  if (!req.googleAccount) throw new Error("Google account was not loaded.");
  return req.googleAccount;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const account = accountFrom(req);
  try {
    const now = new Date();
    const monthEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [events, reminderRows, activityRows, failedJobRows] = await Promise.all([
      loadEventDtos(account, { from: now.toISOString(), to: monthEnd.toISOString() }),
      db
        .select({ reminder: remindersTable, eventTitle: calendarEventsTable.title })
        .from(remindersTable)
        .innerJoin(calendarEventsTable, eq(remindersTable.eventId, calendarEventsTable.id))
        .where(
          and(
            eq(remindersTable.googleAccountId, account.id),
            eq(remindersTable.enabled, true),
            eq(remindersTable.status, "scheduled"),
            gte(remindersTable.scheduledAt, now),
            isNull(calendarEventsTable.cancelledAt),
          ),
        )
        .orderBy(asc(remindersTable.scheduledAt))
        .limit(8),
      db
        .select()
        .from(activityEntriesTable)
        .where(eq(activityEntriesTable.googleAccountId, account.id))
        .orderBy(desc(activityEntriesTable.createdAt))
        .limit(8),
      db
        .select({ value: count() })
        .from(automationJobsTable)
        .where(
          and(
            eq(automationJobsTable.googleAccountId, account.id),
            eq(automationJobsTable.status, "failed"),
          ),
        ),
    ]);
    const recentActivity = activityRows.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      message: entry.message,
      createdAt: entry.createdAt.toISOString(),
      status: entry.status,
    }));
    res.json(
      GetDashboardResponse.parse({
        upcomingEvents: events.slice(0, 8),
        scheduledReminders: reminderRows.map(({ reminder, eventTitle }) =>
          mapReminder(reminder, eventTitle),
        ),
        recentActivity,
        upcomingCount: events.length,
        reminderCount: reminderRows.length,
        failedJobCount: Number(failedJobRows[0]?.value ?? 0),
      }),
    );
  } catch (error) {
    const candidate = error as { response?: { status?: number }; message?: string };
    req.log.error(
      { googleStatus: candidate.response?.status, message: candidate.message },
      "Could not load dashboard data",
    );
    if (candidate.response?.status === 401 || candidate.response?.status === 403) {
      res.status(candidate.response.status).json({
        error: "Google authorization needs attention before the dashboard can load.",
      });
      return;
    }
    res.status(502).json({ error: "Dashboard data could not be loaded." });
  }
});

export default router;
