# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Production hardening pass.** Took the bootstrap shell from "deployed" to production-grade single-tenant tool. No new business features; Phase 1 (clients, pricing admin, quote builder) is the next milestone.
- **Sentry** error monitoring: `@sentry/nextjs` wired into client, server, and edge runtimes via `sentry.{client,server,edge}.config.ts` and `instrumentation.ts`. Source-map upload runs only when `SENTRY_DSN` + `SENTRY_AUTH_TOKEN` are set; local builds skip cleanly.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): lint + typecheck + vitest + build on every PR and push to `main`; Playwright e2e against the deployed production URL with cached browsers.
- **Playwright e2e baseline**: `e2e/auth.spec.ts` (sign-in happy path, gated by `E2E_TEST_*` env) and `e2e/middleware-redirect.spec.ts` (unauthenticated redirect behavior). Local target via `pnpm test:e2e`; production target via `BASE_URL=https://contracts.dobeu.tech pnpm test:e2e`.
- **Middleware unit test** (`src/lib/supabase/middleware.test.ts`): tests for `isPublicRoute` extracted from `updateSession`.
- **Vitest config** (`vitest.config.ts`) with explicit `include`/`exclude` so vitest and playwright don't fight over `.spec.ts` files.
- **Sentry & e2e env vars** added to `.env.example`: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`.

### Changed

- **README** rewritten from `create-next-app` boilerplate to a real project README with stack, scripts, load-bearing rules, and deployment summary.
- **`src/lib/supabase/middleware.ts`**: extracted `PUBLIC_PATH_PREFIXES` and `isPublicRoute` so the public-routes list can be unit tested without spinning up a Supabase client.
- **`docs/SETUP.md`**: added Sentry, custom domain (`contracts.dobeu.tech`), CI, and e2e test-user sections; documented credential rotation status and cadence.
- **ESLint config** moved from `eslint-config-next` (broken on ESLint 9.39 due to `@rushstack/eslint-patch` incompatibility) to a flat config that uses `@next/eslint-plugin-next` and `@typescript-eslint` directly. Added `@next/eslint-plugin-next`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` as direct devDependencies; dropped `eslint-config-next`.

### Security — pending operator action

- **Credential rotation is required before going public.** Vercel PAT, Supabase PAT, Supabase service-role key, and optionally Supabase anon key were leaked in the bootstrap-session transcript. Runbook is in `docs/SETUP.md`. Rotation cadence after that: quarterly.
- **Vercel env coverage**: only 3 of the ~13 vars in `.env.example` are currently set in Vercel. Remaining keys (DocuSeal, Stripe, Resend, Customer.io, `CLIENT_PORTAL_JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, Sentry vars) need to be set as part of this hardening pass. Use `__UNSET__` for integrations not yet implemented.

### Out of scope (deferred to a later plan)

- Phase 1 UI (clients CRUD, pricing-config admin, quote builder).
- DocuSeal / Stripe / Resend / Customer.io integration code.
- Client portal token-based access.
- Audit-log writes from the application layer.
- RLS policy revision for multi-user (current `auth.role() = 'authenticated'` matches single-owner v1).
