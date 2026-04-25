# Copilot Instructions — DTS Contract Engine

You are working on a contract & consulting-hour management application for
**Dobeu Tech Solutions, LLC**. Read this file fully before every change.

## Mission

Replace ad-hoc Word/PDF contracts and uncounted consulting hours with a
single system that:

1. Generates pricing-correct quotes from a configurable engine
2. Issues legally-formatted contract PDFs with embedded SLA appendices
3. Routes contracts through DocuSeal for e-signature
4. Logs every minute of consulting work against client SLA budgets
5. Auto-flags overages on the next invoice (which the operator can waive
   at their discretion)

## Non-Negotiable Rules

1. **Pricing logic lives server-side only.** The client never receives
   cost basis, multiplier definitions, or discount caps. Only computed
   totals. Implement as Server Actions in `src/lib/pricing/engine.ts`.

2. **The high-touch buffer is invisible on contract output.** When a
   quote has `multipliers.highTouch > 0`, the retainer is inflated by
   that percentage but rendered on the contract PDF as a single
   "Monthly Retainer" line with no buffer disclosure.

3. **The family courtesy IS visible on contract output.** When a quote
   has `multipliers.familyCourtesy > 0`, render it as a discrete line
   item with the time-limit disclosure: "Family Relationship Courtesy
   −$X (first 6 months, reviewed at renewal)".

4. **Rush premium applies to setup only.** Never apply rush to monthly
   retainer.

5. **Term discounts apply BEFORE family courtesy.** Order of operations:
   `(base + recurring) × (1 + highTouch) × (1 - termDiscount) × (1 - familyCourtesy)`

6. **All currency stored as integer cents in DB.** Display layer formats.

7. **Row Level Security is mandatory.** Every table has RLS enabled.
   Only the agency owner (auth.uid()) can read/write operational data.
   Client portal access is via signed JWT tokens scoped to a single
   client_id, never via Supabase auth.

8. **Audit log every pricing config change.** A diff between old and
   new config is written to `audit_log` on every update.

9. **Never delete; always soft-delete.** Use `deleted_at` columns, not
   `DELETE` statements. Quotes and contracts are legal records.

10. **Use Server Actions over API routes** unless an external webhook
    forces an API route (`/api/webhooks/*`). No tRPC unless explicitly
    needed; Server Actions are sufficient.

## Architecture Boundaries

- `src/app/(app)/*` — authenticated agency-side UI
- `src/app/client-portal/[token]/*` — read-only client-side UI (no auth,
  signed token in URL)
- `src/app/api/webhooks/*` — DocuSeal, Stripe, Calendar webhooks only
- `src/lib/pricing/*` — pure functions, no I/O, fully unit-tested
- `src/lib/supabase/*` — server and browser clients, RLS-aware
- `src/lib/pdf/*` — `@react-pdf/renderer` components
- `src/lib/integrations/*` — DocuSeal, Stripe, Resend, Customer.io clients

## Brand & Aesthetic

- **Fonts:** Fraunces (display) + Geist (body) + Geist Mono (numbers).
  Never use Inter, Roboto, or system-ui as primary fonts.
- **Palette:** Navy `#0A2540` primary, Electric Blue `#2563EB`, Cyan
  `#06B6D4`, Paper `#FAFAF7`. CSS variables only — no hardcoded hex
  outside `globals.css`.
- **Numbers:** Always tabular figures (`font-variant-numeric: tabular-nums`).
- **Contracts on screen and on print must look identical.** Use the
  same React Components for both; differentiate via `@media print` and
  `@react-pdf/renderer` parallel components.

## Coding Standards

- TypeScript strict mode. No `any`. No `// @ts-ignore` without an
  attached issue link.
- Zod schemas for all form input and webhook payloads. Infer types from
  schemas, don't redefine.
- Server Actions return `{ data, error }` — never throw to the client.
- Every Server Action validates auth before doing work.
- Files over 250 lines must be split.
- Components colocate their tests: `Quote.tsx` → `Quote.test.tsx`.
- Run `pnpm lint && pnpm typecheck && pnpm test` before committing.

## Git Hygiene

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`.
- One feature per PR. Do not stack unrelated changes.
- Include a `## Testing` section in every PR description.

## What Already Exists

- A working artifact prototype with the calculation engine and pricing
  config. The TypeScript port is in `src/lib/pricing/`. Trust those
  numbers as the source of truth.
- A signed reference contract for "Unique Staffing Professionals" that
  demonstrates the contract structure DTS uses.

## What You Should NOT Do

- Do not introduce new pricing models without explicit instruction.
- Do not add new dependencies without justification in the PR body.
- Do not implement client-side PDF generation (jsPDF, html2canvas).
  PDFs are server-rendered.
- Do not write logic that exposes pricing config or multipliers in
  client bundles.
- Do not add LocalStorage, SessionStorage, IndexedDB, or any other
  client-side persistence. Source of truth is Supabase.
- Do not implement role-based access yet. Single-owner mode for v1;
  add roles in v2.
