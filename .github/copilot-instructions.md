# Copilot Instructions — DTS Contract Engine

Read this file before making changes. It captures the project-specific rules that are easy to miss by looking at one file at a time.

## Build, test, and lint

This repo uses **pnpm** scripts from `package.json`.

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:watch
pnpm test:ui
pnpm format
```

Run the current unit test file directly with:

```bash
pnpm test -- src\lib\pricing\engine.test.ts
```

Run one named Vitest case with:

```bash
pnpm test -- -t "Growth tier baseline = $3,500/mo" src\lib\pricing\engine.test.ts
```

Pre-commit runs `pnpm lint-staged`, which applies Prettier and ESLint to staged files.

## High-level architecture

### Runtime shape

- This is a **Next.js 15 App Router** app with React 19 and TypeScript strict mode.
- `src/app/layout.tsx` sets the global shell and fonts.
- `src/app/login/page.tsx` is a server component that redirects authenticated users away from `/login`.
- `src/app/login/login-form.tsx` is the main client-side auth UI and uses the browser Supabase client for password sign-in.
- `src/app/page.tsx` is currently a bootstrap shell for authenticated users.
- `src/app/auth/signout/route.ts` signs users out server-side.
- `src/middleware.ts` delegates to `src/lib/supabase/middleware.ts`, which refreshes Supabase auth cookies on every request and redirects unauthenticated users to `/login`.

### Auth and data boundaries

- Supabase auth is wired with `@supabase/ssr`.
- Use `src/lib/supabase/server.ts` in Server Components, Server Actions, and route handlers.
- Use `src/lib/supabase/browser.ts` only inside `"use client"` components.
- Do **not** remove the `supabase.auth.getUser()` call from middleware; it is the session refresh trigger.

### Domain core

- The pricing engine in `src/lib/pricing/` is the most mature business logic in the repo.
- `types.ts` defines the shared pricing shapes.
- `config.ts` is the default in-repo pricing configuration; production is expected to load config from the database.
- `engine.ts` is a pure deterministic calculator with no I/O.
- `engine.test.ts` locks the contractual order of operations and is the source of truth for pricing behavior changes.

### Database contract

- The database shape lives in `supabase/migrations/0001_init.sql`.
- All project tables live in the **`dts` Postgres schema**, not `public`.
- Core tables are `agency_settings`, `pricing_config`, `clients`, `quotes`, `contracts`, `consulting_log`, `invoices`, and `audit_log`.
- RLS is enabled on every table.
- Quotes and client records are soft-deleted with `deleted_at`; they are not meant to be hard deleted.
- The current `supabase/config.toml` only exposes `public` and `graphql_public` locally; for real PostgREST use, `dts` must also be exposed as documented in `docs/SETUP.md`.

## Key conventions

### Framework and repo conventions

- This project is on **Next.js 15.5.x**. Before changing framework-level behavior, read the relevant guide under `node_modules/next/dist/docs/` as noted in `CLAUDE.md`.
- Use the `@/*` path alias from `tsconfig.json`.
- UI primitives come from `src/components/ui` and follow the committed `components.json` shadcn setup (`base-nova`, Tailwind CSS v4, CSS variables enabled).

### Pricing rules

These rules come from the existing project instructions and pricing engine tests:

1. Pricing logic stays server-side; do not expose multipliers, raw config, or cost logic in client bundles.
2. `src/lib/pricing/*` stays pure and free of network/database access.
3. All currency is stored and computed as integer cents; formatting belongs in the display layer.
4. Rush premium applies to setup only.
5. Retainer math order is: high-touch buffer -> term discount -> family courtesy.
6. The high-touch buffer affects totals but is intentionally not disclosed as a separate contract line item.
7. Family courtesy is a visible contract line item with the time-limit disclosure.

If you change pricing math, update `engine.test.ts` in the same change.

### Supabase conventions

1. Every project-table query must use `.schema("dts")`.
2. Do not set a global Supabase schema in the client helpers; auth still needs the `auth.*` schema.
3. The shared remote Supabase project also hosts other apps, so remote migration work is not a standard greenfield flow. Read `docs/SETUP.md` before using `supabase db push` against the shared project.

### App-layer conventions

1. Prefer **Server Actions over API routes** unless integrating an external webhook.
2. Server Actions should return `{ data, error }` rather than throw to client code.
3. Validate auth before any server-side write.
4. Use Zod for form input and webhook payload validation.
5. Keep tests colocated with the code they cover.

### Deployment and environment conventions

1. Deployment targets **Vercel**, and the repo is already linked through `.vercel/project.json`.
2. The real deployment runbook is `docs/SETUP.md`, not the default `README.md`.
3. After changing server-side environment variables, redeploy; Vercel env changes do not affect existing deployments until the next build.
4. Expected environment variables come from `.env.example` and already anticipate Supabase, DocuSeal, Stripe, Resend, Customer.io, and client-portal token signing.
5. Vercel SSO / Deployment Protection can block previews and the default production URL. If a deploy works but the site is gated, check the SSO settings before debugging the app itself.

### Webhook and integration boundaries

1. Middleware intentionally leaves `/api/webhooks/*` public; use that namespace for external providers only.
2. Keep inbound third-party handlers narrow and provider-specific, e.g. DocuSeal signature events, Stripe billing events, calendar/logging events.
3. Validate webhook payloads and signature secrets before any side effects.
4. Treat webhook routes as ingestion adapters only: parse -> verify -> hand off to server-side business logic.
5. External-service clients should live in focused modules under a future `src/lib/integrations/*` area rather than being embedded directly in route handlers or UI code.
6. The schema already reserves integration touchpoints: `contracts.signature_provider*`, `invoices.stripe_invoice_id`, `consulting_log.source/source_ref`, and client portal token fields.
7. Client portal access is intended to be token-scoped to a single client, not backed by general Supabase auth for end clients.

### Styling and brand conventions

1. Use CSS variables from `src/app/globals.css`; do not scatter one-off color values through components.
2. Current fonts are Geist and Geist Mono from `src/app/layout.tsx`.
3. Numeric displays should keep tabular-number styling where relevant to pricing and contract screens.

## Additional project context worth trusting

- `docs/SETUP.md` contains the real environment and deployment notes, including the shared Supabase-project caveats and Vercel linkage.
- `README.md` is still the default create-next-app README and is not the source of truth for this project.
