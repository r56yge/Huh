# Smart Calendar Automation

A responsive Google Calendar automation dashboard for creating events, scheduling Meet links and reminders, and importing event batches.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/smart-calendar run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required setup: `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`
- Store OAuth client credentials in Replit Secrets, never in the frontend. `GOOGLE_REDIRECT_URI` is an optional exact-URL override.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: generated API schemas with Zod 3; database insert schemas with `zod/v4` and `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Web: React, TypeScript, Tailwind CSS, Vite

## Where things live

- `artifacts/smart-calendar/src/App.tsx` — dashboard, event editor, reminders, activity, and bulk import flows
- `artifacts/api-server/src/routes/` — OAuth, event/calendar, dashboard, and import routes
- `artifacts/api-server/src/lib/job-runner.ts` — scheduled reminder and Meet-conference jobs
- `lib/api-spec/openapi.yaml` — source of truth for the HTTP API
- `lib/db/src/schema/` — PostgreSQL tables and indexes

## Architecture decisions

- Google OAuth is per end user. The app does not collect Google passwords or OTPs; app-owner OAuth client values belong in Replit Secrets.
- Google OAuth tokens are encrypted server-side with AES-256-GCM; `SESSION_SECRET` must remain stable to decrypt saved tokens.
- Calendar-native reminders are used within Google's supported limits; a PostgreSQL-backed worker handles flexible email reminders and pending Meet conferences.
- Bulk import rows use deterministic event IDs so retrying a failed row in the same batch does not create a duplicate event.

## Product

Users connect Google Calendar, create and manage events, review guest invitations, add Meet links and reminders, import CSV/Excel event lists, and review automation history and failures.

## User preferences

Google client credentials must be configured securely for the app; they should not be collected in the frontend.

## Gotchas

- The Google redirect URI must exactly match the callback registered in Google Cloud Console: `/api/auth/google/callback`.
- Gmail API is needed for flexible email reminders. Those reminders go to the connected account owner; Calendar handles guest invitations.
- If a worker is interrupted during a Gmail send, check the inbox before manually retrying the failed job.
- Push schema changes only to the development database with `pnpm --filter @workspace/db run push`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
