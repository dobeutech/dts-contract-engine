# DTS Contract Engine

Contract & consulting-hour management for **Dobeu Tech Solutions**. Generates pricing-correct quotes from a configurable engine, issues legally-formatted PDFs, routes through DocuSeal for e-signature, logs every billable minute, and auto-flags overages on the next invoice.

**Status:** bootstrap shell with auth + schema in place. Phase 1 (clients, pricing-config admin, quote builder) is the next milestone. See [docs/SETUP.md](docs/SETUP.md) for the deployment story and [.github/copilot-instructions.md](.github/copilot-instructions.md) for the binding code rules.

## Stack

- **Next.js 15** (App Router) on **Vercel**
- **React 19** + **Tailwind 4** + **shadcn/ui** + **Radix**
- **Supabase** (Postgres + Auth + RLS) — schema isolated under `dts.*`
- **Stripe** (invoicing), **DocuSeal** (e-signature), **Resend** (transactional email) — wired via env, not yet integrated in app code
- **Vitest** + **Playwright** (e2e) for tests
- **Sentry** for error monitoring

## Getting started

```bash
corepack enable
pnpm install
cp .env.example .env.local   # fill in Supabase URL + anon key (minimum)
pnpm dev                      # http://localhost:3000
```

You'll need a Supabase user to log in. Create one in the Supabase dashboard (Authentication → Users → "Add user") for the `unified-ai` project.

## Scripts

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `pnpm dev`       | Local dev server                              |
| `pnpm build`     | Production build                              |
| `pnpm lint`      | ESLint (flat config, Next + TypeScript rules) |
| `pnpm typecheck` | `tsc --noEmit`                                |
| `pnpm test`      | Vitest (unit/integration)                     |
| `pnpm test:e2e`  | Playwright (against `BASE_URL` or local dev)  |
| `pnpm format`    | Prettier write                                |

## Two load-bearing rules

These are easy to violate by accident and break the deploy in non-obvious ways:

1. **Schema isolation:** every Supabase client call must include `.schema('dts')` — e.g. `supabase.schema('dts').from('clients').select('*')`. The Postgres `dts` schema is shared with other apps on the same Supabase project; defaulting to `public` will silently query the wrong tables. See [docs/SETUP.md#schema-isolation--the-load-bearing-rule](docs/SETUP.md).
2. **Don't trust your training data on Next.js APIs:** this version (Next 15.5) has breaking changes from prior majors. Read `node_modules/next/dist/docs/` before writing routing/middleware/data-fetch code. See [AGENTS.md](AGENTS.md).

## Deployment

Production is on Vercel at **`https://contracts.dobeu.tech`** (custom domain) and **`https://dts-contract-engine.vercel.app`** (Vercel default, behind team SSO). CI runs lint + typecheck + tests + build on every PR; e2e tests run against the production URL. See [docs/SETUP.md](docs/SETUP.md) for full deployment details, env-var setup, credential rotation, and where to look when things break.

## Repository layout

```
.github/
  workflows/ci.yml            # GitHub Actions CI
  copilot-instructions.md     # binding rules for every Copilot/agent prompt
src/
  app/                        # Next.js App Router (UI lands here, Phase 1+)
  components/ui/              # shadcn/ui primitives
  lib/
    pricing/                  # pure pricing engine + types + tests (do not
                              # change without updating engine.test.ts —
                              # order of operations is contractual)
    supabase/                 # browser/server/middleware Supabase clients
e2e/                          # Playwright specs
supabase/
  migrations/0001_init.sql    # initial schema, all in dts.*
docs/
  SETUP.md                    # deployment + env + rotation runbook
sentry.{client,server,edge}.config.ts  # Sentry SDK init for each runtime
instrumentation.ts            # Next.js instrumentation hook
playwright.config.ts          # Playwright config
.vercel/project.json          # links repo to the Vercel project (no secrets)
```

## License

Proprietary — Dobeu Tech Solutions, LLC.
