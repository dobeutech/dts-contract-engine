# Setup — DTS Contract Engine

Onboarding for a new developer or a future-you who has lost context.
Assumes a fresh clone with no local state.

## Prerequisites

- Node 22+ (24.x is what was tested) — the repo uses Corepack-managed pnpm
- A Netlify account with access to the **dobeutechsolutions** team
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

## Netlify deployment

Site is `dts-contract-engine` under the **dobeutechsolutions** team.

- Site ID: `3ee2c4c9-dd7e-4ef6-aa98-31f818f5244c`
- Production URL: `https://dts-contract-engine.netlify.app`
- Required env vars (already set; replace if rotated):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

To redeploy from local:

```bash
$env:NETLIFY_AUTH_TOKEN="<PAT>"   # PowerShell
pnpm exec netlify deploy --prod --build
```

To set or rotate an env var:

```bash
pnpm exec netlify env:set SUPABASE_SERVICE_ROLE_KEY "<new-value>"
```

This works once `.netlify/state.json` points at site `3ee2c4c9-...`. If
the CLI fails with `Missing required path variable 'account_id'`, the
site's stored `account_id` mismatches your token's accessible team —
re-create the site under the team your token can write to.

## Credential rotation

In production, all four of these credentials should be on a rotation
schedule. The session that bootstrapped this repo leaked them in a
transcript; rotate before going public:

| Credential                | Where                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Netlify PAT               | `https://app.netlify.com/user/applications#personal-access-tokens`                                                  |
| Supabase PAT              | `https://supabase.com/dashboard/account/tokens`                                                                     |
| Supabase service-role key | Project Settings → API → "Reset service_role key", then `pnpm exec netlify env:set SUPABASE_SERVICE_ROLE_KEY <new>` |
| Supabase anon key         | Same place; anon keys are designed to be public so this is optional                                                 |

After rotating any Netlify env var, trigger a redeploy
(`pnpm exec netlify deploy --prod --build`) — env-var changes are not
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
netlify.toml                  # build config + security headers
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
| Netlify build fails with env-var missing                   | Env var unset; check `pnpm exec netlify env:list`                                                                  |
| `pnpm supabase db push` complains about unknown migrations | Foreign app's history; use Path A above instead                                                                    |
| Form components missing                                    | `pnpm dlx shadcn@latest add form` is silently broken on shadcn 4.4 + RHF 7.73 — hand-port from the registry source |
