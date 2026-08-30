# Key rotation runbook (approved 2026-08-30)

`.env.production` was committed to this repository and contained the Supabase
**service-role key** (bypasses all Row Level Security) and the **Wasender API key**.
The file is now removed from the working tree and ignored, but the keys remain valid
and remain visible in git history — **rotation is what actually closes the exposure.**

## Order of operations (do all in one sitting)

### 0. Before anything: verify Vercel env vars exist

In the Vercel project that serves production (Settings → Environment Variables),
confirm these are defined for Production (and Preview if used):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WASENDER_API_KEY`
- `WASENDER_BASE_URL`
- `CRON_SECRET`

Next.js reads a committed `.env.production` at build time, so if any of these are
missing from Vercel, the first deploy after this branch merges would silently fall
back to placeholder values. **Do not merge this branch until this check passes.**

### 1. Rotate the Supabase keys

Supabase Dashboard → Project Settings → API:

- If the project has the newer **publishable/secret API keys**: create a new secret
  key for server use, put it in Vercel as `SUPABASE_SERVICE_ROLE_KEY`'s replacement,
  then revoke the old legacy service-role key once deployed.
- Otherwise (legacy JWT-based keys): use **"Generate new JWT secret"**. This rotates
  BOTH `anon` and `service_role` keys at once. Note: users' current access tokens
  become invalid for up to ~1 hour but sessions recover automatically via refresh
  tokens; do it at a low-traffic hour.

Immediately after generating:

1. Copy the new `anon` and `service_role` keys.
2. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
3. Trigger a redeploy of production.
4. Verify: log in, load the planning page, make a test admin action.

### 2. Rotate the Wasender API key

Wasender dashboard → API keys → regenerate. Update `WASENDER_API_KEY` in Vercel,
redeploy, then send a test WhatsApp (admin → any flow that messages you).

### 3. Optional: purge git history

Rotation makes the leaked values worthless, which is the real fix. If you also want
them out of history: `git filter-repo --invert-paths --path .env.production` on a
fresh clone, then force-push and have every collaborator re-clone. Do this only
after steps 1–2 and coordinate with anyone who has clones.
