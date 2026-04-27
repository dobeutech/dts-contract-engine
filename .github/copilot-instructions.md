# Copilot Instructions — DTS Contract Engine

Read this file before making changes. It captures the project-specific rules that are easy to miss by looking at one file at a time.

## Build, test, and lint

This repo uses **pnpm** scripts from `package.json`. Use `corepack enable` first.

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:watch
pnpm test:ui
pnpm test:e2e
pnpm test:e2e:ui
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

Run one Playwright spec or one named Playwright test with:

```bash
pnpm test:e2e -- e2e\auth.spec.ts
pnpm test:e2e -- -g "sign in, land on app shell, sign out"
```

Pre-commit runs `pnpm lint-staged`, which applies Prettier and ESLint to staged files.
CI runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm test:e2e` against `https://contracts.dobeu.tech`.

## High-level architecture

### Runtime shape

- This is a **Next.js 15 App Router** app with React 19 and TypeScript strict mode.
- `src/app/layout.tsx` sets the global shell, Nunito/JetBrains Mono fonts, and toaster.
- `src/app/login/page.tsx` is a server component that redirects authenticated users away from `/login`.
- `src/app/login/login-form.tsx` is the main client-side auth UI and uses the browser Supabase client for password sign-in.
- `src/app/auth/callback/route.ts` exchanges the Supabase OAuth code, allow-lists the `next` destination, and lands authenticated users on `/admin`.
- `src/app/page.tsx` is just a router: it redirects to `/login` when anonymous and `/admin` when authenticated.
- `src/app/(admin)` is the authenticated app shell; admin pages are server-rendered and use server actions for mutations.
- `src/app/portal/[token]` is a separate public client portal keyed by a capability URL token, not by Supabase end-user auth.
- `src/app/auth/signout/route.ts` signs users out server-side.
- `src/middleware.ts` delegates to `src/lib/supabase/middleware.ts`, which refreshes Supabase auth cookies on every request, redirects unauthenticated users to `/login`, and deliberately leaves `/api/webhooks/*` and `/portal/*` public.

### Auth and data boundaries

- Supabase auth is wired with `@supabase/ssr`.
- Use `src/lib/supabase/server.ts` in Server Components, Server Actions, and route handlers.
- Use `src/lib/supabase/browser.ts` only inside `"use client"` components.
- Use `src/lib/supabase/service.ts` only in server-only contexts that intentionally bypass RLS, such as token-scoped portal reads, audit writes, and webhook processing.
- Do **not** remove the `supabase.auth.getUser()` call from middleware; it is the session refresh trigger.
- Portal routes treat the URL token as the authorization material. `src/lib/db/portal.ts` enforces expiry/revocation against `clients.portal_token_*` columns and only exposes portal-safe quotes.

### Domain core

- The pricing engine in `src/lib/pricing/` is the most mature business logic in the repo.
- `types.ts` defines the shared pricing shapes.
- `config.ts` is the default in-repo pricing configuration; production is expected to load config from the database.
- `engine.ts` is a pure deterministic calculator with no I/O.
- `engine.test.ts` locks the contractual order of operations and is the source of truth for pricing behavior changes.
- Admin quote actions validate with Zod, calculate pricing server-side, and persist a `calc` snapshot onto the quote row so admin pages, portal pages, PDFs, and downstream integrations read the same numbers.

### App/data flow

- Admin pages under `src/app/(admin)/admin/*` read via server-only `src/lib/db/*` helpers and mutate via `"use server"` actions.
- `src/lib/actions/result.ts` defines the shared server-action envelope: `{ ok: true, data }` or `{ ok: false, error, code, fieldErrors }`.
- Pricing config is versioned in `dts.pricing_config`; publishing flips the single active config that new quotes use.
- Webhook routes under `src/app/api/webhooks/*` verify provider signatures, dedupe deliveries via `dts.adobe_sign_events` / `dts.stripe_events`, then apply side effects with the service-role client plus audit-log writes.
- Signed contract files live in a private `contracts` storage bucket; server code is expected to use signed URLs rather than public URLs.

### Database contract

- The database contract is defined across `supabase/migrations/*.sql`.
- Start with `0001_init.sql`, then review later migrations for the current shape, especially `0002_publish_pricing_config_rpc.sql`, `0003_adobe_sign.sql`, and `0004_portal_security_and_webhook_idempotency.sql`.
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
- UI primitives under `src/components/ui` set `data-slot` attributes on their root elements.

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
4. `src/lib/supabase/service.ts` bypasses RLS and is reserved for tightly scoped server-side cases; never import it into client code or expose its data blindly.

### App-layer conventions

1. Prefer **Server Actions over API routes** unless integrating an external webhook.
2. Server Actions in this repo typically return the `ActionResult` union from `src/lib/actions/result.ts`, not thrown errors to client callers.
3. Validate auth before any server-side write.
4. Use Zod for form input and webhook payload validation.
5. Keep tests colocated with the code they cover.
6. `clients` and `quotes` are soft-deleted with `deleted_at`; do not hard-delete them in normal app flows.

### Deployment and environment conventions

1. Deployment targets **Vercel**, and the repo is already linked through `.vercel/project.json`.
2. The real deployment runbook is `docs/SETUP.md`, not the default `README.md`.
3. After changing server-side environment variables, redeploy; Vercel env changes do not affect existing deployments until the next build.
4. Expected environment variables come from `.env.example` and already anticipate Supabase, Adobe Sign, Stripe, Resend, Intercom, Sentry, and client-portal settings.
5. Vercel SSO / Deployment Protection can block previews and the default production URL. If a deploy works but the site is gated, check the SSO settings before debugging the app itself.
6. The supported Node range is `>=20 <24`; `docs/SETUP.md` calls out a Node 24 build issue.

### Webhook and integration boundaries

1. Middleware intentionally leaves `/api/webhooks/*` public; use that namespace for external providers only.
2. Keep inbound third-party handlers narrow and provider-specific, e.g. Adobe Sign signature events and Stripe billing events.
3. Validate webhook payloads and signature secrets before any side effects.
4. Treat webhook routes as ingestion adapters only: parse -> verify -> hand off to server-side business logic.
5. External-service clients live in focused modules under `src/lib/integrations/*` rather than being embedded directly in route handlers or UI code.
6. The schema already reserves integration touchpoints: `contracts.signature_provider*`, `invoices.stripe_invoice_id`, `consulting_log.source/source_ref`, and client portal token fields.
7. Client portal access is intended to be token-scoped to a single client, not backed by general Supabase auth for end clients.
8. Webhook handlers use idempotency ledgers (`dts.adobe_sign_events`, `dts.stripe_events`) so retries do not replay side effects.

### Styling and brand conventions

1. Use CSS variables from `src/app/globals.css`; do not scatter one-off color values through components.
2. Current fonts are Nunito and JetBrains Mono from `src/app/layout.tsx`.
3. Numeric displays should keep tabular-number styling where relevant to pricing and contract screens.
4. Do not mount third-party scripts in the portal layout while the portal token remains embedded in the URL path.

## Additional project context worth trusting

- `docs/SETUP.md` contains the real environment and deployment notes, including the shared Supabase-project caveats, Node-version constraint, webhook setup, and Vercel linkage.
- `README.md` is useful for stack, scripts, and deployment/CI overview, but `docs/SETUP.md`, `CLAUDE.md`, and this file are the higher-signal sources for project-specific rules.
