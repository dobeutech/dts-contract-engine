# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is **pnpm** (use `corepack enable` first).

```bash
pnpm dev          # next dev on http://localhost:3000
pnpm build        # production build
pnpm lint         # ESLint flat config (Next + TS rules)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (unit/integration)
pnpm test:watch   # vitest watch
pnpm test:e2e     # playwright (uses BASE_URL or local dev)
pnpm format       # prettier --write .
```

Run a single Vitest file or named case (forward slashes also work cross-platform):

```bash
pnpm test -- src/lib/pricing/engine.test.ts
pnpm test -- -t "Growth tier baseline = $3,500/mo" src/lib/pricing/engine.test.ts
```

Pre-commit runs `lint-staged` (Prettier + ESLint --fix on staged files). Husky is installed via `pnpm prepare`. Commit messages are linted by `@commitlint/config-conventional` — use Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.) or the commit will be rejected.

## Architecture

**Next.js 15.5 App Router** + React 19 + TypeScript strict + Tailwind 4 + shadcn/ui (`base-nova`). Use the `@/*` path alias.

### Auth & request flow

- Supabase auth via `@supabase/ssr`, gated globally by `src/middleware.ts` → `src/lib/supabase/middleware.ts`. Middleware refreshes the session cookie and redirects unauthenticated users to `/login`. **Do not remove `supabase.auth.getUser()` from middleware** — it is the session refresh trigger.
- `src/lib/supabase/server.ts` → Server Components, Server Actions, route handlers.
- `src/lib/supabase/browser.ts` → `"use client"` components only.
- `/api/webhooks/*` is intentionally left public by middleware — that namespace is reserved for external providers (DocuSeal, Stripe, etc.).

### Domain core: pricing engine

`src/lib/pricing/` is the most mature business logic and is the contract for pricing behavior:

- `types.ts` — shared shapes
- `config.ts` — default in-repo config (production loads from DB)
- `engine.ts` — **pure deterministic calculator, no I/O, no network, no DB**
- `engine.test.ts` — locks the contractual order of operations; update in the same change as any pricing math change

Pricing rules (do not violate):

1. Pricing logic stays server-side; never expose multipliers, raw config, or cost math in client bundles.
2. All currency is integer cents; formatting belongs in the display layer.
3. Rush premium applies to **setup only**.
4. Retainer math order: high-touch buffer → term discount → family courtesy.
5. High-touch buffer affects totals but is **not** a separate disclosed line item.
6. Family courtesy **is** a visible line item with the time-limit disclosure.

### Database

Schema lives in `supabase/migrations/0001_init.sql`. Core tables: `agency_settings`, `pricing_config`, `clients`, `quotes`, `contracts`, `consulting_log`, `invoices`, `audit_log`. RLS is on for every table. `quotes` and `clients` are soft-deleted via `deleted_at`.

**Schema isolation — load-bearing rule:** every project-table query must use `.schema('dts')`, e.g. `supabase.schema('dts').from('clients').select('*')`. The Supabase project is shared with other apps; defaulting to `public` silently queries the wrong tables. Do **not** set a global schema in the client helpers — `auth.*` must remain reachable. `supabase/config.toml` only exposes `public` and `graphql_public` locally; for real PostgREST use, `dts` must also be exposed (see `docs/SETUP.md`). Because the remote project is shared, `supabase db push` is **not** a standard greenfield flow — read `docs/SETUP.md` first.

### App-layer conventions

- Prefer **Server Actions over API routes** unless integrating an external webhook.
- Server Actions return `{ data, error }` rather than throwing to client code.
- Validate auth before any server-side write.
- Use Zod for form input and webhook payload validation.
- Tests are colocated with the code they cover.
- Webhook routes are ingestion adapters: parse → verify signature → hand off to server-side logic. External-service clients belong under a future `src/lib/integrations/*`, not embedded in route handlers or UI.
- **Client portal access is token-scoped per client**, not Supabase auth for end clients. The `clients` table reserves portal token fields — use those, do not invent a parallel auth path for `/portal` routes.
- **Integration touchpoints already exist in the schema** — when wiring DocuSeal, Stripe, or Customer.io, populate the existing columns (`contracts.signature_provider*`, `invoices.stripe_invoice_id`, `consulting_log.source` / `source_ref`) rather than adding parallel ones.

### Styling

CSS variables live in `src/app/globals.css` — do not scatter one-off colors. Fonts are Geist / Geist Mono from `src/app/layout.tsx`. Pricing/contract numeric displays use tabular-number styling.

## Critical gotchas

1. **This is not the Next.js you know.** Next 15.5 has breaking changes from prior majors. Before changing routing, middleware, data fetching, or framework-level behavior, read the relevant guide under `node_modules/next/dist/docs/`. Do not trust training data for Next.js APIs.
2. **`docs/SETUP.md`** is the real deployment runbook (env vars, credential rotation, Vercel SSO/Deployment Protection caveats, shared-Supabase migration story). The default `README.md` is partially `create-next-app` boilerplate — `docs/SETUP.md` wins on conflicts.
3. **Vercel env changes don't affect existing deployments** until the next build — redeploy after server-side env changes.
4. **Vercel SSO / Deployment Protection** can gate previews and the default production URL (`dts-contract-engine.vercel.app`). If a deploy succeeds but the site is locked, check SSO before debugging the app.

## Deployment

Vercel; production domains `https://contracts.dobeu.tech` and `https://dts-contract-engine.vercel.app`. CI runs lint + typecheck + tests + build per PR; e2e runs against the production URL. Sentry is wired via `sentry.{client,server,edge}.config.ts` and `instrumentation.ts`.
