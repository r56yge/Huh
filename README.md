# Smart Calendar Automation

A responsive calendar dashboard for connecting a Google account, creating and editing Calendar events, scheduling Meet conferences and reminders, and importing event lists from CSV or Excel.

## Google setup

The Google OAuth client credentials belong to the app owner and must be stored as **Replit Secrets**. They are not entered in the web app and are never sent to the browser. Each user connects their own Google account through Google's sign-in and consent flow. The app never asks for Google passwords or one-time codes.

1. In Google Cloud Console, create a project and enable the **Google Calendar API**. Enable the **Gmail API** too if users need flexible email reminders beyond Google Calendar's native reminder limits.
2. Configure the OAuth consent screen and add test users while the app is in testing mode. Google's review and consent-screen requirements depend on the scopes and how the app is distributed.
3. Create an OAuth client of type **Web application**.
4. Add the exact Replit app callback URL to the client's authorized redirect URIs:

   `https://YOUR-APP-HOST/api/auth/google/callback`

   Replace `YOUR-APP-HOST` with the app's actual HTTPS host. The URL must match exactly in Google Cloud Console and `GOOGLE_REDIRECT_URI`.
5. In Replit, open **Tools → Secrets** and add these values:

   | Secret / variable | Purpose |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | Google OAuth web client ID; used by the server only |
   | `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret; used by the server only |
   | `GOOGLE_REDIRECT_URI` | Exact callback URL registered above |
   | `SESSION_SECRET` | Long random secret for browser sessions and OAuth token encryption |
   | `DATABASE_URL` | PostgreSQL connection string |
   | `APP_ORIGIN` | Optional app root URL used after the OAuth callback, e.g. `https://YOUR-APP-HOST` |

   Do not put client secrets, access tokens, or refresh tokens in source files, browser storage, or frontend environment variables. Keep `SESSION_SECRET` stable: changing it makes previously encrypted Google tokens unreadable and users will need to reconnect.

The OAuth flow uses PKCE and a session-bound state value. It requests identity, Calendar event/calendar-list, and Gmail send scopes. Gmail send is used only by the server-side scheduler for flexible email reminders, which are sent to the connected account owner; guest invitations are handled by Google Calendar.

## Run and validate

The Replit workspace has separate API and web workflows:

```sh
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/smart-calendar run dev
```

Useful checks:

```sh
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-spec run codegen
```

The API health endpoint is `/api/healthz`. The OAuth flow starts at `/api/auth/google`. After changing the OpenAPI contract, regenerate the typed API client and validators with the codegen command, then run typecheck.

## What the app does

- Creates and edits events with calendar selection, all-day or timed dates, time zone, guests, recurrence, optional Meet, and multiple reminders.
- Requires an invitation review before event forms send guest invitations. Bulk execution also requires an explicit `confirmed: true` request, enforced by the API.
- Uses Calendar API reminder overrides where supported. A PostgreSQL-backed job queue and cron worker handles flexible email reminders and pending Meet conference checks.
- Stores OAuth tokens encrypted at rest with AES-256-GCM. Browser sessions are HTTP-only and stored in PostgreSQL.
- Supports CSV and `.xlsx` imports, row validation and preview, confirmation, per-row outcomes, and retry-safe event IDs within an import batch. Legacy `.xls` workbooks are not supported.
- Shows upcoming events, reminders, activity, and failed automation jobs, with search, pause/resume, edit, cancel, and retry controls.

The worker claims due jobs using PostgreSQL row locks. If a process stops during a possible Gmail send, the job is marked failed rather than automatically resent; check the connected inbox before manually retrying so an accepted email is not duplicated.

## Configuration and verification status

The database schema is defined in `lib/db/src/schema/` and is pushed to the development database with `pnpm --filter @workspace/db run push`. API routes and the durable worker are in `artifacts/api-server/src/`; the web interface is in `artifacts/smart-calendar/`; the source API contract is `lib/api-spec/openapi.yaml`.

The app code and database schema are in place. A live Google OAuth, Calendar, Meet, or Gmail delivery test still requires the Google Cloud client configuration and secrets listed above.
