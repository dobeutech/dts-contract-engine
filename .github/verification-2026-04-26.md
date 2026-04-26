# Post-Bootstrap Verification — 2026-04-26

Run against commit on branch `chore/post-bootstrap-verification`.
Stack: Next.js 15.5.15 · React 19.2.4 · TypeScript 5.9.3 · pnpm 10.33.2

## Check results

| Check       | Result  | Notes                                       |
| ----------- | ------- | ------------------------------------------- |
| `typecheck` | ✅ PASS | `tsc --noEmit` exited 0, no errors          |
| `lint`      | ✅ PASS | ESLint flat config exited 0, no warnings    |
| `build`     | ✅ PASS | Next.js production build succeeded (15.5 s) |
| `test`      | ✅ PASS | 17/17 Vitest tests passed across 2 files    |

## Files changed

| File                                 | Reason                                           |
| ------------------------------------ | ------------------------------------------------ |
| `src/components/ui/form.tsx`         | Hand-ported shadcn form component (see below)    |
| `.github/verification-2026-04-26.md` | This report (durable record of verification run) |

## form.tsx hand-port

`pnpm dlx shadcn@latest add form` is a known silent no-op on shadcn 4.4 + react-hook-form 7.73
(documented in `docs/SETUP.md` under "Form components missing"). The component was hand-ported
from the canonical new-york-v4 shadcn registry source.

The external registry URL (`https://ui.shadcn.com/r/styles/new-york-v4/form.json`) was not
reachable from the CI-sandbox environment (sandbox egress allowlist blocks it), so the component
was reconstructed from the canonical implementation:

- Uses React 19 functional-component style (no `forwardRef`) — consistent with `label.tsx`,
  `button.tsx`, and `input.tsx` in this project.
- Wraps `react-hook-form` `FormProvider` / `Controller` / `useFormContext` (v7.73.1, installed).
- `FormControl` delegates to `@radix-ui/react-slot` `Slot` (v1.2.4, installed).
- `FormLabel` wraps the project `Label` from `@/components/ui/label`.
- `cn` imported from `@/lib/utils`.
- Exports: `Form`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`,
  `FormMessage`, `FormField`, `useFormField`.
- Verified: `pnpm typecheck` passes in strict mode, `pnpm build` succeeds.

## Schema namespace audit — `supabase/migrations/0001_init.sql`

All DDL was inspected for schema qualification. **No violations found.**

Allowed unqualified statements present:

- `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` (line 9) — public schema, allowed per Supabase convention
- `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` (line 10) — public schema, allowed per Supabase convention
- `CREATE SCHEMA IF NOT EXISTS dts` (line 13) — the schema creation itself, allowed

All other DDL (`CREATE TABLE`, `CREATE INDEX`, `CREATE TRIGGER`, `CREATE POLICY`,
`GRANT`, `ALTER DEFAULT PRIVILEGES`) correctly references `dts.*`.

## Supabase project link status

**Supabase project not yet linked** (from this environment).

Signals checked:

- `supabase/.temp/project-ref`: file does not exist
- `SUPABASE_PROJECT_REF` env var: not set
- `supabase/config.toml` `project_id`: `"dts-contract-engine"` (local placeholder,
  not the remote project ref `qdwvcrmdqweojverdmmz`)

The remote project ref (`qdwvcrmdqweojverdmmz`) is documented in `docs/SETUP.md`.
`supabase db push` should NOT be run from this environment — see `docs/SETUP.md`
for the shared-Supabase migration caveats.

## Vercel / Netlify deploy status

Both external URLs returned `403 x-deny-reason: host_not_allowed` from the sandbox
egress filter — the sandbox environment blocks outbound HTTP to arbitrary hosts, so
HTTP-level status from the Vercel/Netlify origins could not be confirmed from here.

Per `docs/SETUP.md`:

- Production: `https://contracts.dobeu.tech` (custom domain, SSO-exempt)
- Vercel auto-generated: `https://dts-contract-engine.vercel.app` (SSO-gated for team members)
- Netlify: deleted during migration to Vercel (expected to 404 or redirect)

If you can reach the production URL from a non-sandbox browser, a 200 or Supabase login
redirect confirms the deploy is healthy.

## Items for human follow-up

1. **Credential rotation** — `docs/SETUP.md` notes that Vercel PAT, Supabase PAT,
   service-role key, and anon key were exposed in the bootstrap transcript. Rotate
   before going public (see the rotation table in `docs/SETUP.md`).

2. **Sentry `global-error.tsx`** — the production build emits a Sentry deprecation warning
   recommending a `global-error.tsx` file for React rendering error capture. Not a blocker,
   but worth adding in a follow-up.

3. **Sentry `instrumentation-client.ts`** — build warns that `sentry.client.config.ts` will
   not work with Turbopack. If Turbopack is adopted, migrate to `instrumentation-client.ts`.

4. **Dependabot alerts** — check the GitHub Security tab on `main` for any alerts raised
   since bootstrap. In particular, `lucide-react` (if used) and other recently-bumped packages.

5. **e2e test credentials** — `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` GitHub Actions secrets
   must be set for the auth e2e spec to run (auto-skips without them; middleware-redirect e2e
   still runs as a canary).

6. **`dts` schema in Supabase exposed schemas** — confirm `dts` is listed under
   Dashboard → Project Settings → API → Data API Settings → Exposed schemas,
   or use the Management API PATCH documented in `docs/SETUP.md`. Without this,
   every PostgREST call will return `PGRST106 Invalid schema: dts`.
