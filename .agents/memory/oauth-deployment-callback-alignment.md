---
name: OAuth deployment callback alignment
description: Separate OAuth redirect registration for preview and production, plus production environment update behavior.
---

Register each exact environment origin separately in the Google OAuth client. Preview and published hosts differ, even when they use the same callback route.

**Why:** Google recognizes the OAuth client separately from its redirect URI, and an already-published Replit deployment does not automatically load changed production secrets or environment variables.

**How to apply:** Before validating sign-in in production, authorize the published domain callback in Google Cloud, set the production callback to that URL, then republish so the live deployment loads the current credentials and callback.
