# Setup — DTS Contract Engine

Onboarding for a new developer or a future-you who has lost context.
Assumes a fresh clone with no local state.

## Prerequisites

- Node 20–23 (Node 24 has a webpack `WasmHash` cache bug that crashes `next build`; clear `.next/` if you hit it). `engines` in `package.json` enforces this.
- A Vercel account with access to the **dobeutech-7910s-projects** team
- A Supabase account with access to the **unified-ai** project (`qdwvcrmdqweojverdmmz`)
- The GitHub CLI (`gh`) authenticated against `dobeutech`

## First-time bootstrap

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
pnpm test    # 7/7 should pass
pnpm build   # production build should succeed
```

## Schema isolation — the load-bearing rule

This project shares the `unified-ai` Supabase project with other apps.
**Every project table lives in the `dts` Postgres schema.** That isolation
depends on three things:

1. The migration creates `CREATE SCHEMA IF NOT EXISTS dts` and qualifies
   every table/index/trigger/policy with `dts.` (see `supabase/migrations/0001_init.sql`).
2. The Supabase REST API has `dts` added to its **Exposed schemas** list
   (Dashboard → Project Settings → API → Data API Settings → Exposed schemas).
   Without this, every PostgREST query returns `PGRST106 Invalid schema: dts`.
3. Every Supabase client call uses `.schema('dts')`:

   ```ts
   supabase.schema("dts").from("clients").select("*");
   ```

   This is enforced by Copilot rule 7a in `.github/copilot-instructions.md`.
   The Supabase JS client defaults to `public`; forgetting the `.schema()`
   call will silently query (or fail to find) the wrong tables.

If you ever see `PGRST106` errors after a Supabase project change, the
exposed-schemas list is the first thing to check. To set it via the
Management API instead of the dashboard:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"db_schema":"public,graphql_public,dts"}' \
  https://api.supabase.com/v1/projects/qdwvcrmdqweojverdmmz/postgrest
```

## Applying migrations

The default Supabase CLI flow (`supabase db push`) does **not** work cleanly
against the unified-ai project because its migration history table contains
entries from other apps. Two paths:

### Path A — Dashboard SQL Editor (preferred for one-offs)

1. Open `https://supabase.com/dashboard/project/qdwvcrmdqweojverdmmz/sql/new`
2. Paste the migration file contents
3. Run

### Required for production launch — apply migration `0004`

`supabase/migrations/0004_portal_security_and_webhook_idempotency.sql` must be
applied before the production webhooks are turned on. It:

- adds `portal_token_expires_at`, `portal_token_revoked_at`, `portal_token_last_used_at` to `dts.clients` (90-day backfill on existing rows);
- creates `dts.adobe_sign_events` and `dts.stripe_events` for webhook dedup;
- creates the **private** `contracts` storage bucket and locks `storage.objects` to service-role-only reads/writes for that bucket.

The application code already expects this schema — running the webhooks
without it will return `ledger_unavailable` 500s on the first event.

`supabase/migrations/v5_event_ledger_and_retry_queue.sql` is also in the repo for
source-of-truth completeness, but it belongs to a different app on the shared
project. **Do not re-apply it from here.**

### Path B — CLI (only if you accept the migration-history caveat)

```bash
pnpm exec supabase login --token <PAT>
pnpm exec supabase link --project-ref qdwvcrmdqweojverdmmz
# If db push complains about unknown remote migrations:
pnpm exec supabase migration repair --status reverted <foreign-migration-id>
pnpm exec supabase db push
```

The `reverted` mark is local-only and will not affect the foreign app's
tables — but it does mean _that_ app will see its migration as reverted
in its own CLI view. Coordinate with the other tenant before doing this.

## Vercel deployment

Project is `dts-contract-engine` under the **dobeutech-7910s-projects** team.

- Project ID: `prj_OvQ1IBFLPKAvvWYeK9kbA3sW0s1Y`
- Team ID: `team_8K43hpr1Nzs0UsjjUCGh8OBK`
- Production URL: `https://dts-contract-engine.vercel.app`
- Required env vars (already set; replace if rotated):
  - `NEXT_PUBLIC_SUPABASE_URL` — plain text, all targets
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — plain text, all targets
  - `SUPABASE_SERVICE_ROLE_KEY` — encrypted, production+preview only
  - `ADOBE_SIGN_BASE_URI` — Adobe Sign account base URI (for example `https://api.na1.adobesign.com`)
  - `ADOBE_SIGN_INTEGRATION_KEY` — Adobe Sign integration key
  - `ADOBE_SIGN_WEBHOOK_CLIENT_ID` — expected `X-AdobeSign-ClientId` header value

The repo is linked via `.vercel/project.json` (committed since it has no
secrets — only project + team IDs). `vercel` CLI auto-detects the link
when run from the repo root.

### Why Vercel and not Netlify

We tried Netlify first. Two issues hit consecutively:

1. `@netlify/plugin-nextjs` 5.15.9 doesn't yet support Next.js 16 — the
   Lambda runtime can't find `next/dist/server/lib/start-server.js`.
2. Even after pinning to Next 15.5.x, pnpm's symlinked `node_modules`
   layout broke Vercel NFT (Node File Trace) — `start-server.js` wasn't
   getting included in the function bundle. The fix would have been
   `node-linker=hoisted` in `.npmrc`, but Vercel handles pnpm natively
   without that workaround, so we moved.

### Deploying

CLI is installed as a devDep. The Vercel PAT must be set as an env var
(never committed):

```bash
$env:VERCEL_TOKEN="<PAT>"   # PowerShell
pnpm exec vercel deploy --prod --yes
```

`--yes` accepts existing project link without prompting. Without
`--prod`, you get a preview deploy (gated by SSO unless disabled — see
below).

### Setting or rotating env vars

```bash
$env:VERCEL_TOKEN="<PAT>"
pnpm exec vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes
pnpm exec vercel env add SUPABASE_SERVICE_ROLE_KEY production
# (paste new value at the prompt; it never lands in shell history)
```

After any env change, redeploy: env updates do NOT propagate to existing
deployments — they only apply to the next build.

### Deployment Protection / SSO

Vercel teams default to **Standard Protection** (`ssoProtection.deploymentType: "all_except_custom_domains"`), which means every preview URL and the auto-generated production URL require Vercel SSO to view. The custom domain (if you add one) is exempt.

This was disabled during initial bootstrap so we could verify the deploy.
Re-enable for internal-only access:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.vercel.com/v9/projects/prj_OvQ1IBFLPKAvvWYeK9kbA3sW0s1Y?teamId=team_8K43hpr1Nzs0UsjjUCGh8OBK" \
  -d '{"ssoProtection":{"deploymentType":"all_except_custom_domains"}}'
```

When SSO is on, only Vercel team members (or invited guests) can access
the site — appropriate for an internal tool. Once we're ready for
clients to view contracts via the portal, either:

- Add a custom domain (which is exempt from SSO), or
- Use `passwordProtection` for client-portal-only routes, or
- Build the client portal under a path that bypasses SSO via `/api/`
  routes that authenticate via the `client_portal_token` instead.

## Custom domain — `contracts.dobeu.tech`

The production-facing URL is `https://contracts.dobeu.tech`. The domain is
attached to the Vercel project and acts as the SSO bypass: `*.vercel.app`
preview URLs require Vercel team SSO, the custom domain is publicly
reachable and gated only by the Supabase login.

This is the **dual-gate auth model**: Vercel SSO (outer, team-only) on
previews; Supabase email/password (inner, per-user) on the production
custom domain.

### Verifying the SSO setting

Vercel SSO `deploymentType` must be `all_except_custom_domains`:

```bash
# Read current setting
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/prj_OvQ1IBFLPKAvvWYeK9kbA3sW0s1Y?teamId=team_8K43hpr1Nzs0UsjjUCGh8OBK" \
  | jq '.ssoProtection'

# If it's anything other than {"deploymentType":"all_except_custom_domains"}, PATCH:
curl -X PATCH \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.vercel.com/v9/projects/prj_OvQ1IBFLPKAvvWYeK9kbA3sW0s1Y?teamId=team_8K43hpr1Nzs0UsjjUCGh8OBK" \
  -d '{"ssoProtection":{"deploymentType":"all_except_custom_domains"}}'
```

### Supabase auth URLs

Supabase Auth's redirect-URL allowlist must include the custom domain.
In the Supabase dashboard for the `unified-ai` project: **Authentication
→ URL Configuration**:

- **Site URL**: `https://contracts.dobeu.tech`
- **Redirect URLs** (allowlist): `https://contracts.dobeu.tech`,
  `https://contracts.dobeu.tech/**`, plus the existing `*.vercel.app`
  entries for previews.

`NEXT_PUBLIC_APP_URL` in Vercel env should match: `https://contracts.dobeu.tech`.

### Google OAuth (the "Continue with Google" button)

The login page exposes a Google SSO button alongside the email/password
form. Until the provider is enabled in Supabase, clicking it surfaces a
"Google sign-in is not yet enabled" error — the email path keeps working.

Enable in three steps:

1. **Google Cloud OAuth client.** In the Google Cloud Console for the
   project that hosts the OAuth consent screen, create a Web Application
   OAuth 2.0 Client ID. Authorized JavaScript origins: `https://contracts.dobeu.tech`.
   Authorized redirect URI: `https://qdwvcrmdqweojverdmmz.supabase.co/auth/v1/callback`
   (Supabase's hosted callback — **not** the app's `/auth/callback`).
2. **Supabase provider.** Dashboard → Authentication → Providers → Google.
   Toggle on, paste the Client ID + Client Secret from step 1. Save.
3. **App callback.** No code change needed; `src/app/auth/callback/route.ts`
   already exchanges the code Supabase forwards back. Confirm
   `https://contracts.dobeu.tech/auth/callback` is on the redirect-URL
   allowlist (it should be, since `https://contracts.dobeu.tech/**` covers it).

After enabling, sign-in flow is: button → Google consent screen →
Supabase code exchange → `/auth/callback` → `/`. Restrict who can sign in
by limiting the Google Workspace domain in the OAuth consent screen, or
by adding an `auth.users` allowlist trigger on Supabase.

## Sentry

Error monitoring is wired through `@sentry/nextjs`. Three init files —
`sentry.client.config.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts` — plus `instrumentation.ts` and a
`withSentryConfig` wrap in `next.config.ts`.

Build-time source-map upload activates when both `SENTRY_DSN` and
`SENTRY_AUTH_TOKEN` are set; without them the wrap is a no-op so local
builds stay clean.

Required env vars (set in Vercel for production+preview):

```bash
SENTRY_DSN              # https://<key>@<org>.ingest.sentry.io/<project>
NEXT_PUBLIC_SENTRY_DSN  # same value, exposed to the browser SDK
SENTRY_ORG              # e.g. dobeu-tech
SENTRY_PROJECT          # e.g. dts-contract-engine
SENTRY_AUTH_TOKEN       # https://sentry.io/settings/account/api/auth-tokens/
                        # (project:write scope; production+preview only)
```

Sample rates default to `tracesSampleRate: 0.1` and
`replaysOnErrorSampleRate: 1.0` (replay only on errors). Replay masking
is on by default — passwords and other inputs are not recorded.

## CI — GitHub Actions

`.github/workflows/ci.yml` runs on every PR and push to `main`:

| Job      | Steps                                                                |
| -------- | -------------------------------------------------------------------- |
| `verify` | `pnpm install --frozen-lockfile`, lint, typecheck, vitest, build     |
| `e2e`    | Playwright against `https://contracts.dobeu.tech` (gated by secrets) |

**Required GitHub secrets** for the e2e job:

| Secret              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `E2E_TEST_EMAIL`    | Email for the dedicated e2e Supabase user |
| `E2E_TEST_PASSWORD` | Password for the same user                |

If those secrets aren't set, the auth e2e auto-skips; the
middleware-redirect e2e still runs and acts as a deployed-site canary.

## End-to-end tests

Two specs in `e2e/`:

- `auth.spec.ts` — sign in with `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`,
  verify the home page shows the expected user, sign out. Auto-skips if
  credentials aren't set.
- `middleware-redirect.spec.ts` — confirms the middleware redirects
  unauthenticated traffic to `/login` and that `/login` is reachable
  directly. No credentials needed.

Run locally against the dev server:

```bash
pnpm test:e2e
```

Run against production (no local dev server boot — Playwright detects
the external `BASE_URL` and skips `webServer`):

```bash
BASE_URL=https://contracts.dobeu.tech pnpm test:e2e
```

### The dedicated e2e Supabase user

Create one Supabase auth user (`Authentication → Users → Add user`) with
a memorable email like `e2e-test@dobeu.tech` and a strong password.
Store both as GitHub repo secrets (`E2E_TEST_EMAIL`,
`E2E_TEST_PASSWORD`). Don't reuse a real human's account — the e2e
tests sign in and out repeatedly.

## Credential rotation

In production, all four of these credentials should be on a rotation
schedule. The session that bootstrapped this repo leaked them in a
transcript; rotate before going public:

| Credential                | Where                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Vercel PAT                | `https://vercel.com/account/settings/tokens`                                                                                       |
| Supabase PAT              | `https://supabase.com/dashboard/account/tokens`                                                                                    |
| Supabase service-role key | Project Settings → API → "Reset service_role key", then re-add via `pnpm exec vercel env add SUPABASE_SERVICE_ROLE_KEY production` |
| Supabase anon key         | Same place; anon keys are designed to be public so this is optional                                                                |

After rotating any Vercel env var, trigger a redeploy
(`pnpm exec vercel deploy --prod --yes`) — env-var changes are not
picked up by existing functions until the next build.

## Repository layout (the parts that matter)

```text
.github/
  workflows/ci.yml            # GitHub Actions: lint/typecheck/test/build + e2e
  copilot-instructions.md     # binding rules for every Copilot prompt
src/
  app/                        # Next.js App Router (UI lands here, Phase 1+)
  components/ui/              # shadcn/ui primitives
  lib/
    pricing/                  # PURE pricing engine + types + tests (do not touch
                              # without updating engine.test.ts — order of
                              # operations is contractual)
    supabase/                 # browser/server/middleware Supabase clients
                              # + middleware.test.ts
e2e/                          # Playwright specs
supabase/
  config.toml                 # Supabase CLI local config (linked to remote)
  migrations/0001_init.sql    # initial schema, all in dts.*
docs/
  SETUP.md                    # this file
sentry.{client,server,edge}.config.ts   # Sentry SDK init for each runtime
instrumentation.ts            # Next.js instrumentation hook (loads Sentry)
playwright.config.ts          # Playwright config
vitest.config.ts              # Vitest config (excludes e2e/)
.vercel/project.json          # links repo to the Vercel project (no secrets)
```

## Pre-commit hook

`pnpm lint-staged` runs Prettier + ESLint on staged files. To bypass
intentionally (rare):

```bash
git commit --no-verify -m "..."
```

Don't bypass to "fix it later" — if lint-staged fails, fix the underlying
issue. Bypassing is reserved for genuine emergencies.

## Where to look when things break

| Symptom                                                    | Likely cause                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PGRST106 Invalid schema: dts` from any Supabase call      | `dts` not in exposed schemas list (see above)                                                                                 |
| Query returns 0 rows when data exists                      | Forgot `.schema('dts')` on the client; querying `public`                                                                      |
| Vercel build fails with env-var missing                    | Env var unset; check `pnpm exec vercel env ls production`                                                                     |
| Vercel deploy URL shows "Authentication Required"          | Deployment Protection / SSO is on — see Vercel deployment section above                                                       |
| Custom domain shows SSO challenge                          | `ssoProtection.deploymentType` is not `all_except_custom_domains` — see Custom domain section above                           |
| `pnpm supabase db push` complains about unknown migrations | Foreign app's history; use Path A above instead                                                                               |
| Form components missing                                    | `pnpm dlx shadcn@latest add form` is silently broken on shadcn 4.4 + RHF 7.73 — hand-port from the registry source            |
| `eslint-config-next` errors with rushstack patch failure   | Don't reintroduce `eslint-config-next` — we use `@next/eslint-plugin-next` directly via flat config (see `eslint.config.mjs`) |
| Sentry events not arriving from production                 | Check `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` are set in Vercel envs and the build emitted source maps                           |
| e2e tests skip silently in CI                              | `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` GH Actions secrets are missing                                                         |
