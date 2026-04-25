# Phase 1 — Quote Machine — Design

Date: 2026-04-25
Status: Approved (awaiting spec review)
Owner: jswilliamstu@gmail.com

## Context

`dts-contract-engine` is currently a bootstrap shell: Supabase auth, the `dts.*` schema (clients, quotes, pricing_config, contracts, consulting_log, invoices, audit_log), a pure pricing engine in `src/lib/pricing/`, shadcn/ui primitives, Vercel deploy with Sentry + CI + Playwright. No business UI yet — `src/app/page.tsx` is a placeholder.

Production-ready scope for the full system was decomposed into three independently shippable phases:

- **Phase 1 — Quote machine** (this doc)
- **Phase 2 — Contract lifecycle** (PDF, DocuSeal, signed-doc storage)
- **Phase 3 — Billing & time** (Stripe, consulting log, overage detection)

This document covers Phase 1 only. Phases 2 and 3 will get their own brainstorm → spec → plan cycles.

## Goal

Replace spreadsheet quoting. The operator (Dobeu) can sign in, configure pricing, add a client, build a math-correct quote against the active pricing config, save it, mark it sent / lost / void, and see every change in the audit log.

## Non-goals (deferred)

- Quote PDF / contract PDF / DocuSeal — Phase 2.
- Stripe / invoicing / consulting log UI — Phase 3.
- Client portal / token-scoped routes — Phase 2/3.
- Email sending (Resend) — Phase 2.
- Multi-user RLS — staying in single-owner mode (any authenticated user has full access; matches the existing schema).
- Data import — fresh start; no historical clients or quotes are migrated.
- Webhook handlers — `/api/webhooks/*` namespace stays empty in Phase 1.
- Typed form per field for the pricing-config admin — JSON editor with Zod is sufficient.
- Bulk operations, advanced search, restore-from-soft-delete UI.

## Architecture

### Directory layout

```
src/
  app/
    (app)/                          # auth-gated route group
      layout.tsx                    # nav shell (Quotes / Clients / Pricing / Audit)
      page.tsx                      # dashboard: counts + recent quotes
      clients/
        page.tsx                    # list (server)
        new/page.tsx                # create form
        [id]/
          page.tsx                  # detail + edit
          edit-form.tsx             # client component
      quotes/
        page.tsx                    # list with status filter
        new/page.tsx                # builder entry — pick client + project type
        [id]/
          page.tsx                  # detail (read-only summary + actions)
          builder.tsx               # client builder component (live calc)
      pricing/
        page.tsx                    # versions list (active + history)
        [id]/page.tsx               # JSON editor for one version
        new/page.tsx                # new draft seeded from active
      audit/
        page.tsx                    # last 200 entries, filterable
  lib/
    pricing/                        # untouched — still pure, still 7/7 tests
    db/
      clients.ts                    # repository: list/get/create/update/softDelete
      quotes.ts                     # repository: list/get/create/update/duplicate/softDelete/transition
      pricing-config.ts             # repository: getActive/list/getById/createDraft/publish
      audit.ts                      # writeAuditLog (uses service-role client)
    actions/                        # Server Actions, thin wrappers around repos
      clients.ts
      quotes.ts
      pricing-config.ts
    schemas/                        # Zod schemas
      client.ts
      quote.ts
      pricing-config.ts             # mirrors PricingConfig type — strict
    supabase/
      server.ts                     # existing (anon, cookie-bound)
      browser.ts                    # existing
      service.ts                    # NEW — service-role client; audit writes only
      middleware.ts                 # existing
supabase/
  migrations/
    0001_init.sql                   # existing
    0002_pricing_publish_rpc.sql    # NEW — atomic publish RPC
  tests/
    rls.sql                         # NEW — RLS policy assertions
```

### Three Supabase client tiers

- **Anon client** (`server.ts`, `browser.ts`) — every read/write that should respect the user's session and RLS.
- **Service-role client** (`service.ts`) — used **only** by `lib/db/audit.ts` and only for `audit_log` inserts. Never imported by route components or pages directly.
- ESLint `no-restricted-imports` blocks `@/lib/supabase/service` outside `@/lib/db/audit`.

### Server Actions over API routes

Every mutation is a Server Action returning `ActionResult<T>` (envelope below). No new `/api/*` routes in Phase 1; webhook namespace stays empty.

Actions:

- `createClient`, `updateClient`, `softDeleteClient`
- `createQuote`, `updateQuote`, `duplicateQuote`, `transitionQuote(id, to: 'sent'|'lost'|'void', reason?)`, `softDeleteQuote`
- `createPricingDraft`, `updatePricingDraft`, `publishPricingVersion(id)`

### Pricing engine integration

The engine stays pure, no I/O. The Server Action `createQuote` / `updateQuote` is the only place that:

1. Loads the active `pricing_config` (or, on edit, the explicit `pricing_config_id` already on the quote — see "Edit draft" below).
2. Calls `calc(input, config)` from `engine.ts`.
3. Stores the input, the calc result, and the `pricing_config_id` on the row.

Quote totals for display are read straight from `quotes.calc`. The builder runs `calc()` client-side too for live totals as the user types — fed the same JSON config the server loaded, passed in as a prop from the Server Component. No round-trips while typing. The engine has no secrets, no I/O, and is safe to ship to the client; the bundle audit test (below) ensures no service-role key or other secret bleeds in.

On save, the server **always re-runs** `calc()` against the chosen config — never trusts client-supplied totals.

### Audit-log architecture

Two-stage write:

1. Each Server Action does the primary write under the user's session (RLS-enforced).
2. On success, calls `writeAuditLog({ actorId, action, entityType, entityId, diff })` which uses the service-role client (RLS bypassed) to insert into `audit_log`.

If the audit insert fails, the primary write is **not** rolled back; we log a Sentry error but don't fail the user-facing action. Audit gaps are observable via Sentry. Transactional rollback would require a `SECURITY DEFINER` function and is out of scope for Phase 1.

Alternative considered and rejected for Phase 1: a `dts.write_audit(...)` `SECURITY DEFINER` function callable by `authenticated`. Adds plpgsql + a migration we don't need yet; service-role-from-Node is fine since the keys never touch the browser.

## Data flow

### Flow A — Pricing-config admin

1. **List** (`/pricing`) — `pricingConfig.list()` → `[{ id, version, is_active, created_at, created_by }]`. "Create new draft" button.
2. **Create draft** (`/pricing/new`) — Server Component fetches the active config JSON; client component mounts a JSON editor (Monaco or CodeMirror, decision deferred to plan) pre-filled. Save → `createPricingDraft({ json })` → Zod parses against `pricingConfigSchema`. On parse error, `{ error: { fieldErrors } }` rendered inline. On success, inserts a row with `version = max(version) + 1`, `is_active = false`, `created_by = auth.uid()`. Redirect to `/pricing/[id]`.
3. **Edit draft** (`/pricing/[id]` where `is_active = false`) — same editor, `updatePricingDraft`. Active versions are read-only — to change them, create a new draft from the active and publish.
4. **Publish** — `publishPricingVersion(id)` calls a new RPC `dts.publish_pricing_version(version_id uuid)` defined in migration `0002`:

   ```sql
   CREATE OR REPLACE FUNCTION dts.publish_pricing_version(version_id uuid)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = dts, pg_catalog
   AS $$
   BEGIN
     UPDATE dts.pricing_config SET is_active = false WHERE is_active = true;
     UPDATE dts.pricing_config SET is_active = true  WHERE id = version_id;
   END;
   $$;
   GRANT EXECUTE ON FUNCTION dts.publish_pricing_version(uuid) TO authenticated;
   ```

   The existing unique partial index `dts_pricing_config_one_active` still enforces "at most one active"; the RPC just makes the swap atomic. Audit `pricing.publish` with `diff: { from_version, to_version }`.

### Flow B — Clients CRUD

1. `/clients` — paginated list (50/page), search by company (`ILIKE`), filter by `relationship_tag`, hides `deleted_at IS NOT NULL` by default.
2. `/clients/new` — form: company, contact_name, email, phone, address, notes, relationship_tag. Zod-validated.
3. `/clients/[id]` — detail + edit + "Soft delete" button. Soft-delete sets `deleted_at = now()`. Quotes for soft-deleted clients still appear in the quotes list with a "Client archived" badge.
4. **No restore UI in Phase 1** — manual SQL is acceptable.
5. Audit: `client.create | client.update | client.soft_delete` with field-level before/after diffs.

### Flow C — Quote builder

#### C1. New quote (`/quotes/new?clientId=...`)

Server Component loads: client, active `pricing_config`. Passes config + clientId to client builder.

Builder UI sections, all driven by config:

- Project type radio (`marketing | website | consulting`)
- Tier select (only shown for `marketing`)
- Setup items checkboxes with qty inputs where `qty: true`
- Recurring add-ons checkboxes
- Website templates select + extra-page / CMS qty (only for `website`)
- Multipliers: rush slider (0–maxRush), highTouch slider (0–maxHT), familyCourtesy slider (0–maxFC)
- Term radio (monthly / six / twelve)
- Custom consulting block (hours + rateCents) for `consulting`

Live totals sidebar runs `calc()` in a `useMemo` on every input change.

"Save draft" → `createQuote(input)` → server re-runs `calc()` against the active config → inserts `quotes` row with `status='draft'`, `pricing_config_id=<active>`, scope, multipliers, term, custom_consulting, and the freshly computed `calc`. Audit `quote.create`.

#### C2. Edit draft (`/quotes/[id]` where `status='draft'`)

Loads the quote and the **same `pricing_config_id` it was created against** — not necessarily the current active config. This freezes pricing for the duration of a draft.

"Re-base on active config" button — explicit action, generates a new draft from current state against the current active config (treated like `duplicateQuote`). Audit `quote.rebase`.

Save → `updateQuote(id, input)` → recompute `calc`, write row. Audit `quote.update` with diff.

#### C3. Status transitions

- `draft → sent` — manual button, sets `sent_at = now()`. After this, the quote becomes read-only in the UI; further edits require duplicate. No back-transition in Phase 1.
- `draft | sent → lost | void` — terminal, sets status, audit-logs reason (free text).
- `signed | active | closed` — out of scope (Phase 2).
- All transitions go through `transitionQuote(id, to, reason?)`, which validates the from→to edge in code.

#### C4. Duplicate

Copies a quote's input fields into a new `draft` against the **currently-active** `pricing_config`. Recomputes `calc`. Audit `quote.duplicate` with `from_id`.

#### C5. Soft delete

Available from the quote detail page for quotes in `draft | lost | void`. Sets `deleted_at = now()`. `sent` quotes cannot be soft-deleted from the UI — once sent, mark `void` first (or `lost`), then delete. Audit `quote.soft_delete`.

## RLS

Schema is already single-owner; Phase 1 adds tests, not policies.

`supabase/tests/rls.sql` asserts:

- As `anon`: `SELECT` on every `dts.*` table fails or returns 0 rows.
- As `authenticated`: full CRUD on `clients`, `quotes`, `pricing_config`.
- `audit_log`: `authenticated` can `SELECT` but cannot `INSERT` (existing `owner_read` policy is read-only).
- Service-role audit-log writes are validated through Server Action integration tests, not SQL (service-role bypasses RLS by design — SQL-only assertion would be trivial).

Run via `pnpm test:rls` (psql against a fresh `supabase db reset`'d shadow DB). CI gates on this.

No RLS policy changes in Phase 1. If tests reveal the existing policies are wrong, we surface that as an out-of-scope finding.

## Error handling

Every Server Action returns:

```ts
type ActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: ActionError };

type ActionError =
  | { kind: "validation"; fieldErrors: Record<string, string[]> }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "conflict"; message: string }
  | { kind: "unexpected"; message: string };
```

- `validation` from Zod `.safeParse()` — rendered inline in forms.
- `not_found` / `forbidden` / `conflict` — toast + redirect to list when appropriate.
- `unexpected` — Sentry log with full context (user id, action name, sanitized input), generic toast to user.
- The pricing engine throws on impossible inputs (e.g. unknown tier id); the Server Action wraps and maps to `validation`.

## Testing strategy

| Layer                            | Tool                            | Scope                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing engine                   | Vitest                          | Existing 7/7 tests must still pass; no changes to `engine.ts`.                                                                                                                                                                                                                                                |
| Zod schemas                      | Vitest                          | Round-trip parse/serialize for `PricingConfig`, `QuoteInput`, `ClientInput`. Catches drift between `types.ts` and Zod schemas.                                                                                                                                                                                |
| Repositories (`lib/db/*`)        | Vitest + Supabase test instance | List/get/create/update/softDelete happy paths and RLS-denied paths. CI uses docker; local uses `supabase start`.                                                                                                                                                                                              |
| Server Actions (`lib/actions/*`) | Vitest                          | Mocked Supabase client; assert envelope shape, audit-log calls, status-transition validation.                                                                                                                                                                                                                 |
| RLS policies                     | psql + `supabase/tests/rls.sql` | Single source of truth for RLS expectations. CI gate.                                                                                                                                                                                                                                                         |
| Builder live-calc parity         | Vitest                          | Run `calc()` on a fixture, then call Server Action with the same input; assert stored `calc` matches. Catches client/server drift.                                                                                                                                                                            |
| E2E                              | Playwright                      | Sign-in → create client → build quote → save draft → edit → mark sent → list shows correct counts. Plus an audit-log assertion query.                                                                                                                                                                         |
| Bundle audit                     | Vitest                          | Walk the `.next/static` client bundle output and assert no `SUPABASE_SERVICE_ROLE_KEY` value, no `CLIENT_PORTAL_JWT_SECRET` value, and no occurrence of any env-var value listed as server-only in `.env.example`. Defense against accidental leakage. (Table names are not secrets and are not asserted on.) |

Coverage target: 80%+ on `lib/db`, `lib/actions`, `lib/schemas`. UI components are not unit-tested; E2E covers the golden path.

## Acceptance criteria

A reviewer can do this in order without help:

1. Sign in with Supabase email/password against `https://contracts.dobeu.tech`.
2. Land on dashboard, see "0 quotes / 0 clients / pricing config v1 active".
3. Open `/pricing`, see one active version (seeded from `config.ts` via a one-shot seed script), open it (read-only), then create a draft, edit a tier price, publish. Previous version is now `is_active = false`. Audit log shows `pricing.publish`.
4. Create two clients (one `standard`, one `family`).
5. Build a quote for the family client: `marketing` / `growth` tier / 6-month term / familyCourtesy 15%. Live totals match the engine's deterministic numbers. Save draft. Open it again and edit it. Duplicate it. Mark the duplicate `sent`, then mark the original `lost` with reason "client went with competitor".
6. Open `/audit`, see all of the above events with diffs.
7. Open the production URL in an unauthenticated browser, get redirected to `/login`. Confirm `next.config.ts` does not set `experimental.serverActions.allowedOrigins` to anything permissive — Next 15 Server Actions encrypt action IDs and bind to the deployment origin by default; the acceptance check is "no override loosens this".
8. CI is green on the merge to `main`: lint + typecheck + vitest + rls.sql + e2e + build all pass.
9. `pnpm test` passes locally with all new tests; `pnpm test:e2e` against production passes after the merge deploys.

## Open questions for the implementation plan

- JSON editor library: Monaco vs CodeMirror — pick during plan based on bundle size and Next 15 compatibility.
- Seed script for `pricing_config` v1 from `config.ts`: one-shot Node script vs a migration insert — pick during plan.
- Whether the bundle audit test runs in CI as a separate job or as part of `pnpm test` post-build.

## References

- Schema: `supabase/migrations/0001_init.sql`
- Pricing engine: `src/lib/pricing/{types.ts,config.ts,engine.ts,engine.test.ts}`
- Auth & middleware: `src/middleware.ts`, `src/lib/supabase/middleware.ts`
- Project rules: `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`
- Deployment runbook: `docs/SETUP.md`
