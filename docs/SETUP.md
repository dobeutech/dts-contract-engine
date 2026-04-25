# Setup — DTS Contract Engine

Onboarding for a new developer or a future-you who has lost context.
Assumes a fresh clone with no local state.

## Prerequisites

- Node 22+ (24.x is what was tested) — the repo uses Corepack-managed pnpm
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

```
.github/
  copilot-instructions.md     # binding rules for every Copilot prompt
src/
  app/                        # Next.js App Router (UI lands here, Phase 1+)
  components/ui/              # shadcn/ui primitives
  lib/
    pricing/                  # PURE pricing engine + types + tests (do not touch
                              # without updating engine.test.ts — order of
                              # operations is contractual)
supabase/
  config.toml                 # Supabase CLI local config (linked to remote)
  migrations/0001_init.sql    # initial schema, all in dts.*
docs/
  SETUP.md                    # this file
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

| Symptom                                                    | Likely cause                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PGRST106 Invalid schema: dts` from any Supabase call      | `dts` not in exposed schemas list (see above)                                                                      |
| Query returns 0 rows when data exists                      | Forgot `.schema('dts')` on the client; querying `public`                                                           |
| Vercel build fails with env-var missing                    | Env var unset; check `pnpm exec vercel env ls production`                                                          |
| Vercel deploy URL shows "Authentication Required"          | Deployment Protection / SSO is on — see Vercel deployment section above                                            |
| `pnpm supabase db push` complains about unknown migrations | Foreign app's history; use Path A above instead                                                                    |
| Form components missing                                    | `pnpm dlx shadcn@latest add form` is silently broken on shadcn 4.4 + RHF 7.73 — hand-port from the registry source |
