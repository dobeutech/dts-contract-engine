# Phase 1 — Quote Machine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 1 quote machine: clients CRUD, versioned pricing-config admin (JSON editor + Zod), quote builder + list/detail with status transitions, audit log, all gated behind existing Supabase auth.

**Architecture:** Server Actions over API routes, repository layer in `src/lib/db/*`, Zod schemas in `src/lib/schemas/*`, service-role Supabase client only used by audit helper. Pure pricing engine stays untouched. Pricing config is JSONB-versioned with an atomic publish RPC.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Supabase (Postgres + Auth + RLS, schema `dts`), shadcn/ui, Tailwind 4, Vitest, Playwright. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-04-25-phase1-quote-machine-design.md`

---

## Conventions for every task

- All Supabase project-table queries use `.schema('dts')`. Forgetting this is the most common error.
- Pricing engine export is `calculate(input, config)` (not `calc`). The display formatter is `formatCents(cents)`.
- All money is integer cents.
- Server Actions return `ActionResult<T>` (defined in Task 4).
- Each task ends with running `pnpm typecheck && pnpm lint && pnpm test` and a commit.
- Keep commits small; one task = one commit unless the task explicitly says otherwise.

---

## Task 1: ActionResult envelope and base types

**Files:**

- Create: `src/lib/actions/result.ts`
- Test: `src/lib/actions/result.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/actions/result.test.ts
import { describe, it, expect } from "vitest";
import { ok, validationError, notFound, unexpected, isOk } from "./result";

describe("ActionResult helpers", () => {
  it("ok wraps data with null error", () => {
    const r = ok({ id: "x" });
    expect(r).toEqual({ data: { id: "x" }, error: null });
    expect(isOk(r)).toBe(true);
  });

  it("validationError wraps fieldErrors", () => {
    const r = validationError({ email: ["required"] });
    expect(r.error?.kind).toBe("validation");
    if (r.error?.kind === "validation") {
      expect(r.error.fieldErrors).toEqual({ email: ["required"] });
    }
    expect(isOk(r)).toBe(false);
  });

  it("notFound has stable kind", () => {
    expect(notFound().error?.kind).toBe("not_found");
  });

  it("unexpected carries a message", () => {
    expect(unexpected("boom").error?.kind).toBe("unexpected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/actions/result.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/actions/result.ts
export type ActionError =
  | { kind: "validation"; fieldErrors: Record<string, string[]> }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "conflict"; message: string }
  | { kind: "unexpected"; message: string };

export type ActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: ActionError };

export const ok = <T>(data: T): ActionResult<T> => ({ data, error: null });

export const validationError = (
  fieldErrors: Record<string, string[]>,
): ActionResult<never> => ({
  data: null,
  error: { kind: "validation", fieldErrors },
});

export const notFound = (): ActionResult<never> => ({
  data: null,
  error: { kind: "not_found" },
});

export const forbidden = (): ActionResult<never> => ({
  data: null,
  error: { kind: "forbidden" },
});

export const conflict = (message: string): ActionResult<never> => ({
  data: null,
  error: { kind: "conflict", message },
});

export const unexpected = (message: string): ActionResult<never> => ({
  data: null,
  error: { kind: "unexpected", message },
});

export const isOk = <T>(r: ActionResult<T>): r is { data: T; error: null } =>
  r.error === null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/actions/result.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/result.ts src/lib/actions/result.test.ts
git commit -m "feat: add ActionResult envelope for Server Actions"
```

---

## Task 2: Zod schema for ClientInput

**Files:**

- Create: `src/lib/schemas/client.ts`
- Test: `src/lib/schemas/client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/schemas/client.test.ts
import { describe, it, expect } from "vitest";
import { clientInputSchema, RELATIONSHIP_TAGS } from "./client";

describe("clientInputSchema", () => {
  it("accepts a minimal valid client", () => {
    const r = clientInputSchema.safeParse({
      company: "Acme Inc",
      relationshipTag: "standard",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing company", () => {
    const r = clientInputSchema.safeParse({ relationshipTag: "standard" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown relationship tag", () => {
    const r = clientInputSchema.safeParse({
      company: "Acme",
      relationshipTag: "vip",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed email", () => {
    const r = clientInputSchema.safeParse({
      company: "Acme",
      relationshipTag: "standard",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("RELATIONSHIP_TAGS matches schema", () => {
    expect(RELATIONSHIP_TAGS).toContain("family");
    expect(RELATIONSHIP_TAGS).toContain("standard");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/schemas/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/schemas/client.ts
import { z } from "zod";

export const RELATIONSHIP_TAGS = [
  "standard",
  "family",
  "partner",
  "high_touch",
  "priority",
] as const;

export const clientInputSchema = z.object({
  company: z.string().min(1, "Company is required").max(200),
  contactName: z.string().max(200).optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
  relationshipTag: z.enum(RELATIONSHIP_TAGS),
});

export type ClientInput = z.infer<typeof clientInputSchema>;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/schemas/client.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/client.ts src/lib/schemas/client.test.ts
git commit -m "feat: add Zod schema for ClientInput"
```

---

## Task 3: Zod schema for PricingConfig

**Files:**

- Create: `src/lib/schemas/pricing-config.ts`
- Test: `src/lib/schemas/pricing-config.test.ts`

This schema mirrors the existing `PricingConfig` TypeScript type in `src/lib/pricing/types.ts`. It must round-trip the existing `DEFAULT_CONFIG` from `src/lib/pricing/config.ts`.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/schemas/pricing-config.test.ts
import { describe, it, expect } from "vitest";
import { pricingConfigSchema } from "./pricing-config";
import { DEFAULT_CONFIG } from "@/lib/pricing/config";

describe("pricingConfigSchema", () => {
  it("round-trips DEFAULT_CONFIG", () => {
    const r = pricingConfigSchema.safeParse(DEFAULT_CONFIG);
    if (!r.success) console.error(r.error.format());
    expect(r.success).toBe(true);
  });

  it("rejects negative prices", () => {
    const bad = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    bad.tiers.starter.monthlyRetainerCents = -100;
    expect(pricingConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiplier max < default", () => {
    const bad = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    bad.multipliers.rush.default = 50;
    bad.multipliers.rush.max = 25;
    expect(pricingConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown project type key", () => {
    const bad = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    bad.projectTypes.spam = { label: "x", description: "y" };
    expect(pricingConfigSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/schemas/pricing-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/schemas/pricing-config.ts
import { z } from "zod";

const cents = z.number().int().nonnegative();
const pct = z.number().min(0).max(100);

const slaTermsSchema = z.object({
  strategyCalls: z.object({
    count: z.number().int().nonnegative(),
    durationMin: z.number().int().nonnegative(),
  }),
  emailResponseHrs: z.number().int().nonnegative(),
  slackResponse: z.string(),
  consultingHrs: z.number().nonnegative(),
  revisionRounds: z.union([z.number().int().nonnegative(), z.string()]),
  reportingCadence: z.string(),
  qbr: z.string(),
});

const tierSchema = z.object({
  name: z.string().min(1),
  monthlyRetainerCents: cents,
  tagline: z.string(),
  sla: slaTermsSchema,
});

const lineItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceCents: cents,
  scope: z.string().optional(),
  default: z.boolean().optional(),
  qty: z.boolean().optional(),
  unit: z.string().optional(),
});

const multiplierSchema = z
  .object({
    label: z.string(),
    default: pct,
    max: pct,
    scope: z.enum(["setup", "retainer"]),
    isDiscount: z.boolean().optional(),
    note: z.string(),
  })
  .refine((m) => m.default <= m.max, {
    message: "default must be <= max",
    path: ["default"],
  });

const termOptionSchema = z.object({
  id: z.enum(["monthly", "six", "twelve"]),
  label: z.string(),
  discount: z.number().min(0).max(1),
  note: z.string(),
});

const projectTypesSchema = z
  .object({
    marketing: z.object({ label: z.string(), description: z.string() }),
    website: z.object({ label: z.string(), description: z.string() }),
    consulting: z.object({ label: z.string(), description: z.string() }),
  })
  .strict();

export const pricingConfigSchema = z.object({
  agency: z.object({
    name: z.string().min(1),
    legalName: z.string().min(1),
    contactName: z.string().min(1),
    contactEmail: z.string().email(),
    website: z.string().min(1),
    address: z.string().optional(),
  }),
  projectTypes: projectTypesSchema,
  tiers: z.record(z.string(), tierSchema),
  setupItems: z.array(lineItemSchema),
  recurringAddOns: z.array(lineItemSchema),
  oneTimeAddOns: z.array(lineItemSchema),
  websiteTemplates: z.array(lineItemSchema),
  multipliers: z.object({
    rush: multiplierSchema,
    highTouch: multiplierSchema,
    familyCourtesy: multiplierSchema,
  }),
  termOptions: z.array(termOptionSchema),
  overageRates: z.object({
    extraStrategyCallCents: cents,
    extraConsultingHourCents: cents,
    sameDayResponseCents: cents,
    afterHoursMultiplier: z.number().positive(),
    emergencyMultiplier: z.number().positive(),
    onSiteMeetingCents: cents,
    extraRevisionRoundCents: cents,
  }),
  paymentTerms: z.object({
    deposit: z.number().min(0).max(1),
    netDays: z.number().int().nonnegative(),
    lateFeePctMonth: z.number().nonnegative(),
  }),
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/schemas/pricing-config.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/pricing-config.ts src/lib/schemas/pricing-config.test.ts
git commit -m "feat: add Zod schema for PricingConfig with DEFAULT_CONFIG round-trip"
```

---

## Task 4: Zod schema for QuoteInput

**Files:**

- Create: `src/lib/schemas/quote.ts`
- Test: `src/lib/schemas/quote.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/schemas/quote.test.ts
import { describe, it, expect } from "vitest";
import { quoteInputSchema } from "./quote";

describe("quoteInputSchema", () => {
  it("accepts a marketing quote with tier and term", () => {
    const r = quoteInputSchema.safeParse({
      clientId: "11111111-1111-1111-1111-111111111111",
      projectName: "Q3 Marketing",
      projectType: "marketing",
      tier: "growth",
      term: "six",
      scope: { setup: { "gsc-ga4-gtm": { enabled: true } } },
      multipliers: { highTouch: 20, familyCourtesy: 10, rush: 0 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing clientId", () => {
    const r = quoteInputSchema.safeParse({
      projectType: "marketing",
      tier: "growth",
      term: "monthly",
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative custom consulting hours", () => {
    const r = quoteInputSchema.safeParse({
      clientId: "11111111-1111-1111-1111-111111111111",
      projectType: "consulting",
      term: "monthly",
      customConsulting: { hours: -1, rateCents: 20000 },
    });
    expect(r.success).toBe(false);
  });

  it("requires tier when projectType=marketing", () => {
    const r = quoteInputSchema.safeParse({
      clientId: "11111111-1111-1111-1111-111111111111",
      projectType: "marketing",
      term: "monthly",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/schemas/quote.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/schemas/quote.ts
import { z } from "zod";

const scopeSelection = z.record(
  z.string(),
  z.object({
    enabled: z.boolean(),
    qty: z.number().int().positive().optional(),
  }),
);

export const quoteInputSchema = z
  .object({
    clientId: z.string().uuid(),
    projectName: z.string().max(200).optional().or(z.literal("")),
    projectType: z.enum(["marketing", "website", "consulting"]),
    tier: z.string().optional(),
    scope: z
      .object({
        setup: scopeSelection.optional(),
        recurring: scopeSelection.optional(),
        oneTime: scopeSelection.optional(),
        website: scopeSelection.optional(),
      })
      .optional(),
    multipliers: z
      .object({
        rush: z.number().min(0).max(100).optional(),
        highTouch: z.number().min(0).max(100).optional(),
        familyCourtesy: z.number().min(0).max(100).optional(),
      })
      .optional(),
    term: z.enum(["monthly", "six", "twelve"]),
    customConsulting: z
      .object({
        hours: z.number().nonnegative(),
        rateCents: z.number().int().nonnegative(),
        description: z.string().optional(),
      })
      .optional(),
    internalNotes: z.string().max(5000).optional().or(z.literal("")),
  })
  .refine(
    (q) => q.projectType !== "marketing" || (q.tier && q.tier.length > 0),
    {
      message: "tier is required when projectType is marketing",
      path: ["tier"],
    },
  );

export type QuoteFormInput = z.infer<typeof quoteInputSchema>;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/schemas/quote.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/quote.ts src/lib/schemas/quote.test.ts
git commit -m "feat: add Zod schema for QuoteInput"
```

---

## Task 5: Service-role Supabase client + ESLint guard

**Files:**

- Create: `src/lib/supabase/service.ts`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Implement service-role client**

```ts
// src/lib/supabase/service.ts
//
// SERVICE-ROLE Supabase client. Bypasses RLS. Server-only.
//
// Allowed importers (enforced by ESLint no-restricted-imports):
//   - src/lib/db/audit.ts
//
// If you think you need this somewhere else, you don't. Use createClient()
// from server.ts and respect RLS.

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Add `server-only` package**

Run: `pnpm add server-only`

- [ ] **Step 3: Add ESLint guard**

Modify `eslint.config.mjs` to add a `no-restricted-imports` rule scoped to everything except `src/lib/db/audit.ts`:

```js
// eslint.config.mjs
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/service", "**/lib/supabase/service"],
              message:
                "Service-role client may only be imported by src/lib/db/audit.ts",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/db/audit.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
```

- [ ] **Step 4: Verify lint catches accidental import**

Create a temporary file `src/__lint_check.ts` containing `import { createServiceRoleClient } from "@/lib/supabase/service";` and run `pnpm lint`. Expected: ESLint reports the restriction. Delete the file. Run `pnpm lint` again — clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/service.ts eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "feat: add service-role Supabase client with ESLint guard"
```

---

## Task 6: Audit-log helper

**Files:**

- Create: `src/lib/db/audit.ts`
- Test: `src/lib/db/audit.test.ts`

The audit helper takes a structured event and inserts to `dts.audit_log` via the service-role client. Failures are caught and logged to Sentry — never thrown to callers.

- [ ] **Step 1: Write failing test (with mocked service-role client)**

```ts
// src/lib/db/audit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const schemaMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({ schema: schemaMock }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { writeAuditLog } from "./audit";
import * as Sentry from "@sentry/nextjs";

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
  schemaMock.mockClear();
  (Sentry.captureException as ReturnType<typeof vi.fn>).mockClear();
});

describe("writeAuditLog", () => {
  it("inserts the event into dts.audit_log", async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    await writeAuditLog({
      actorId: "user-1",
      action: "client.create",
      entityType: "client",
      entityId: "c-1",
      diff: { before: null, after: { company: "Acme" } },
    });
    expect(schemaMock).toHaveBeenCalledWith("dts");
    expect(fromMock).toHaveBeenCalledWith("audit_log");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "user-1",
        action: "client.create",
        entity_type: "client",
        entity_id: "c-1",
      }),
    );
  });

  it("swallows errors and reports to Sentry", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(
      writeAuditLog({
        actorId: "user-1",
        action: "client.create",
        entityType: "client",
        entityId: "c-1",
      }),
    ).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/db/audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/db/audit.ts
import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type AuditEvent = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    const client = createServiceRoleClient();
    const { error } = await client
      .schema("dts")
      .from("audit_log")
      .insert({
        actor_id: event.actorId,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId,
        diff: event.diff ?? null,
        ip: event.ip ?? null,
        user_agent: event.userAgent ?? null,
      });
    if (error) {
      Sentry.captureException(
        new Error(`audit_log insert failed: ${error.message}`),
        {
          extra: { event },
        },
      );
    }
  } catch (err) {
    Sentry.captureException(err, { extra: { event } });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/db/audit.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/audit.ts src/lib/db/audit.test.ts
git commit -m "feat: add audit log helper using service-role client"
```

---

## Task 7: Pricing-config publish RPC migration

**Files:**

- Create: `supabase/migrations/0002_pricing_publish_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_pricing_publish_rpc.sql
--
-- Atomic publish of a pricing_config version. Combined with the
-- existing partial unique index dts_pricing_config_one_active, this
-- guarantees at most one active version at a time even under concurrent
-- publish attempts.

CREATE OR REPLACE FUNCTION dts.publish_pricing_version(version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dts, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dts.pricing_config WHERE id = version_id) THEN
    RAISE EXCEPTION 'pricing_config version % not found', version_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE dts.pricing_config SET is_active = false WHERE is_active = true;
  UPDATE dts.pricing_config SET is_active = true  WHERE id = version_id;
END;
$$;

REVOKE ALL ON FUNCTION dts.publish_pricing_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dts.publish_pricing_version(uuid) TO authenticated;
```

- [ ] **Step 2: Apply migration via Supabase Dashboard**

Per `docs/SETUP.md` Path A: open `https://supabase.com/dashboard/project/qdwvcrmdqweojverdmmz/sql/new`, paste the file contents, run.

Verify: `SELECT proname FROM pg_proc WHERE proname = 'publish_pricing_version';` should return one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_pricing_publish_rpc.sql
git commit -m "feat(db): add atomic publish_pricing_version RPC"
```

---

## Task 8: Pricing-config repository

**Files:**

- Create: `src/lib/db/pricing-config.ts`
- Test: `src/lib/db/pricing-config.test.ts`

- [ ] **Step 1: Write failing test (mocked Supabase client)**

```ts
// src/lib/db/pricing-config.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const builderMock = () => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn();
  chain.maybeSingle = vi.fn();
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  return chain;
};

const mkClient = (chain: ReturnType<typeof builderMock>) => ({
  schema: () => ({ from: () => chain, rpc: vi.fn() }),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
});

import * as repo from "./pricing-config";

describe("pricingConfigRepo", () => {
  it("getActive returns the active row", async () => {
    const chain = builderMock();
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "x",
        version: 1,
        is_active: true,
        config: { agency: { name: "A" } },
      },
      error: null,
    });
    const client = mkClient(chain) as never;
    const r = await repo.getActive(client);
    expect(r?.id).toBe("x");
    expect(chain.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("list returns all versions ordered desc", async () => {
    const chain = builderMock();
    chain.order.mockReturnValueOnce({
      ...chain,
      then: undefined,
    });
    chain.order.mockResolvedValueOnce({ data: [], error: null } as never);
    const client = mkClient(chain) as never;
    await repo.list(client);
    expect(chain.order).toHaveBeenCalledWith("version", { ascending: false });
  });
});
```

(Mock-heavy tests like this are a smell — Task 21 will replace them with a Supabase test container. Keep them for now to lock the call shape.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/db/pricing-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/db/pricing-config.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingConfig } from "@/lib/pricing/types";

export type PricingConfigRow = {
  id: string;
  version: number;
  is_active: boolean;
  config: PricingConfig;
  created_by: string | null;
  created_at: string;
};

export async function getActive(
  client: SupabaseClient,
): Promise<PricingConfigRow | null> {
  const { data, error } = await client
    .schema("dts")
    .from("pricing_config")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data as PricingConfigRow | null;
}

export async function getById(
  client: SupabaseClient,
  id: string,
): Promise<PricingConfigRow | null> {
  const { data, error } = await client
    .schema("dts")
    .from("pricing_config")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PricingConfigRow | null;
}

export async function list(
  client: SupabaseClient,
): Promise<PricingConfigRow[]> {
  const { data, error } = await client
    .schema("dts")
    .from("pricing_config")
    .select("*")
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PricingConfigRow[];
}

export async function createDraft(
  client: SupabaseClient,
  input: { config: PricingConfig; createdBy: string | null },
): Promise<PricingConfigRow> {
  // version = max(version) + 1
  const { data: maxRow, error: maxErr } = await client
    .schema("dts")
    .from("pricing_config")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const nextVersion = (maxRow?.version ?? 0) + 1;

  const { data, error } = await client
    .schema("dts")
    .from("pricing_config")
    .insert({
      version: nextVersion,
      is_active: false,
      config: input.config,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PricingConfigRow;
}

export async function updateDraft(
  client: SupabaseClient,
  id: string,
  config: PricingConfig,
): Promise<PricingConfigRow> {
  const { data, error } = await client
    .schema("dts")
    .from("pricing_config")
    .update({ config })
    .eq("id", id)
    .eq("is_active", false)
    .select("*")
    .single();
  if (error) throw error;
  return data as PricingConfigRow;
}

export async function publish(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.schema("dts").rpc("publish_pricing_version", {
    version_id: id,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/db/pricing-config.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/pricing-config.ts src/lib/db/pricing-config.test.ts
git commit -m "feat: add pricing_config repository"
```

---

## Task 9: Pricing-config seed script

Seed `pricing_config` with version 1 from `DEFAULT_CONFIG`.

**Files:**

- Create: `scripts/seed-pricing-config.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the seed script**

```ts
// scripts/seed-pricing-config.ts
//
// One-shot: seeds dts.pricing_config v1 from DEFAULT_CONFIG if no rows exist.
// Idempotent — running it twice is a no-op.
//
// Usage: pnpm seed:pricing
// Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_CONFIG } from "../src/lib/pricing/config";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }
  const client = createClient(url, key);

  const { data: existing } = await client
    .schema("dts")
    .from("pricing_config")
    .select("id")
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("pricing_config already seeded — skipping");
    return;
  }

  const { data, error } = await client
    .schema("dts")
    .from("pricing_config")
    .insert({ version: 1, is_active: true, config: DEFAULT_CONFIG })
    .select("id, version")
    .single();
  if (error) throw error;
  console.log(`seeded pricing_config v${data.version} id=${data.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Modify `package.json` `scripts`:

```json
"seed:pricing": "tsx scripts/seed-pricing-config.ts"
```

Add tsx as devDep: `pnpm add -D tsx`

- [ ] **Step 3: Run seed locally**

Set env vars in shell and run:

```bash
pnpm seed:pricing
```

Expected: `seeded pricing_config v1 id=<uuid>`

(If you don't have local env set up, skip this step — CI/prod operator will run it once during Phase 1 deploy.)

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-pricing-config.ts package.json pnpm-lock.yaml
git commit -m "feat: add one-shot pricing_config seed script"
```

---

## Task 10: Pricing-config Server Actions

**Files:**

- Create: `src/lib/actions/pricing-config.ts`
- Test: `src/lib/actions/pricing-config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/actions/pricing-config.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/pricing/config";

const repoMock = {
  list: vi.fn(),
  getActive: vi.fn(),
  getById: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  publish: vi.fn(),
};

const supabaseMock = {
  auth: { getUser: vi.fn() },
};

vi.mock("@/lib/db/pricing-config", () => repoMock);
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

const auditMock = vi.fn();
vi.mock("@/lib/db/audit", () => ({ writeAuditLog: auditMock }));

import {
  createPricingDraftAction,
  publishPricingVersionAction,
} from "./pricing-config";

beforeEach(() => {
  Object.values(repoMock).forEach((m) => m.mockReset());
  supabaseMock.auth.getUser.mockReset();
  auditMock.mockReset();
});

describe("createPricingDraftAction", () => {
  it("returns validation error on bad config", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const r = await createPricingDraftAction({ config: { invalid: true } });
    expect(r.error?.kind).toBe("validation");
  });

  it("creates draft and writes audit on valid config", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    repoMock.createDraft.mockResolvedValue({ id: "p1", version: 2 });
    const r = await createPricingDraftAction({ config: DEFAULT_CONFIG });
    expect(r.error).toBeNull();
    expect(repoMock.createDraft).toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pricing.create_draft" }),
    );
  });
});

describe("publishPricingVersionAction", () => {
  it("returns forbidden if not authenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const r = await publishPricingVersionAction({ id: "p1" });
    expect(r.error?.kind).toBe("forbidden");
  });

  it("publishes and audits with from/to versions", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    repoMock.getActive.mockResolvedValue({ version: 1, id: "p0" });
    repoMock.getById.mockResolvedValue({ version: 2, id: "p1" });
    repoMock.publish.mockResolvedValue(undefined);
    const r = await publishPricingVersionAction({ id: "p1" });
    expect(r.error).toBeNull();
    expect(repoMock.publish).toHaveBeenCalledWith(supabaseMock, "p1");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pricing.publish",
        diff: { fromVersion: 1, toVersion: 2 },
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/actions/pricing-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/actions/pricing-config.ts
"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pricingConfigSchema } from "@/lib/schemas/pricing-config";
import * as repo from "@/lib/db/pricing-config";
import { writeAuditLog } from "@/lib/db/audit";
import {
  ok,
  forbidden,
  validationError,
  notFound,
  unexpected,
  type ActionResult,
} from "./result";
import type { PricingConfigRow } from "@/lib/db/pricing-config";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createPricingDraftAction(input: {
  config: unknown;
}): Promise<ActionResult<PricingConfigRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  const parsed = pricingConfigSchema.safeParse(input.config);
  if (!parsed.success) {
    return validationError(
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const row = await repo.createDraft(supabase, {
      config: parsed.data,
      createdBy: user.id,
    });
    await writeAuditLog({
      actorId: user.id,
      action: "pricing.create_draft",
      entityType: "pricing_config",
      entityId: row.id,
      diff: { version: row.version },
    });
    revalidatePath("/pricing");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "createDraft failed");
  }
}

export async function updatePricingDraftAction(input: {
  id: string;
  config: unknown;
}): Promise<ActionResult<PricingConfigRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  const parsed = pricingConfigSchema.safeParse(input.config);
  if (!parsed.success) {
    return validationError(
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const row = await repo.updateDraft(supabase, input.id, parsed.data);
    await writeAuditLog({
      actorId: user.id,
      action: "pricing.update_draft",
      entityType: "pricing_config",
      entityId: row.id,
    });
    revalidatePath(`/pricing/${input.id}`);
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "updateDraft failed");
  }
}

export async function publishPricingVersionAction(input: {
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  try {
    const target = await repo.getById(supabase, input.id);
    if (!target) return notFound();
    const current = await repo.getActive(supabase);
    await repo.publish(supabase, input.id);
    await writeAuditLog({
      actorId: user.id,
      action: "pricing.publish",
      entityType: "pricing_config",
      entityId: input.id,
      diff: {
        fromVersion: current?.version ?? null,
        toVersion: target.version,
      },
    });
    revalidatePath("/pricing");
    return ok({ id: input.id });
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "publish failed");
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/actions/pricing-config.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/pricing-config.ts src/lib/actions/pricing-config.test.ts
git commit -m "feat: pricing-config Server Actions (create/update/publish)"
```

---

## Task 11: Clients repository

**Files:**

- Create: `src/lib/db/clients.ts`
- Test: `src/lib/db/clients.test.ts` (light shape-test; integration in Task 21)

Same shape as Task 8. Methods: `list({ search?, tag? })`, `getById(id)`, `create(input)`, `update(id, patch)`, `softDelete(id)`. Filter `deleted_at IS NULL` on list.

- [ ] **Step 1: Implement**

```ts
// src/lib/db/clients.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientInput } from "@/lib/schemas/client";

export type ClientRow = {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  relationship_tag: string;
  apollo_data: unknown;
  portal_token: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function list(
  client: SupabaseClient,
  opts: { search?: string; tag?: string; includeDeleted?: boolean } = {},
): Promise<ClientRow[]> {
  let q = client.schema("dts").from("clients").select("*");
  if (!opts.includeDeleted) q = q.is("deleted_at", null);
  if (opts.search) q = q.ilike("company", `%${opts.search}%`);
  if (opts.tag) q = q.eq("relationship_tag", opts.tag);
  const { data, error } = await q.order("company", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClientRow[];
}

export async function getById(
  client: SupabaseClient,
  id: string,
): Promise<ClientRow | null> {
  const { data, error } = await client
    .schema("dts")
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ClientRow | null;
}

const toRowPatch = (input: ClientInput) => ({
  company: input.company,
  contact_name: input.contactName || null,
  email: input.email || null,
  phone: input.phone || null,
  address: input.address || null,
  notes: input.notes || null,
  relationship_tag: input.relationshipTag,
});

export async function create(
  client: SupabaseClient,
  input: ClientInput,
): Promise<ClientRow> {
  const { data, error } = await client
    .schema("dts")
    .from("clients")
    .insert(toRowPatch(input))
    .select("*")
    .single();
  if (error) throw error;
  return data as ClientRow;
}

export async function update(
  client: SupabaseClient,
  id: string,
  input: ClientInput,
): Promise<ClientRow> {
  const { data, error } = await client
    .schema("dts")
    .from("clients")
    .update(toRowPatch(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ClientRow;
}

export async function softDelete(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .schema("dts")
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Write a basic shape test**

```ts
// src/lib/db/clients.test.ts
import { describe, it, expect } from "vitest";
import * as repo from "./clients";

describe("clients repo surface", () => {
  it("exports the expected functions", () => {
    expect(typeof repo.list).toBe("function");
    expect(typeof repo.getById).toBe("function");
    expect(typeof repo.create).toBe("function");
    expect(typeof repo.update).toBe("function");
    expect(typeof repo.softDelete).toBe("function");
  });
});
```

- [ ] **Step 3: Run typecheck and test**

Run: `pnpm typecheck && pnpm test -- src/lib/db/clients.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/clients.ts src/lib/db/clients.test.ts
git commit -m "feat: add clients repository"
```

---

## Task 12: Clients Server Actions

**Files:**

- Create: `src/lib/actions/clients.ts`
- Test: `src/lib/actions/clients.test.ts`

Pattern mirrors Task 10 exactly. Actions: `createClientAction`, `updateClientAction`, `softDeleteClientAction`. Each Zod-parses input, calls repo, writes audit with `client.create | client.update | client.soft_delete` and field-level diffs (before/after).

- [ ] **Step 1: Implement**

```ts
// src/lib/actions/clients.ts
"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientInputSchema } from "@/lib/schemas/client";
import * as repo from "@/lib/db/clients";
import { writeAuditLog } from "@/lib/db/audit";
import {
  ok,
  forbidden,
  validationError,
  notFound,
  unexpected,
  type ActionResult,
} from "./result";
import type { ClientRow } from "@/lib/db/clients";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const diffFields = <T extends Record<string, unknown>>(
  before: T | null,
  after: T,
): Record<string, { before: unknown; after: unknown }> => {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([
    ...(before ? Object.keys(before) : []),
    ...Object.keys(after),
  ]);
  for (const k of keys) {
    const b = before ? before[k] : null;
    const a = after[k];
    if (JSON.stringify(b) !== JSON.stringify(a))
      out[k] = { before: b, after: a };
  }
  return out;
};

export async function createClientAction(
  input: unknown,
): Promise<ActionResult<ClientRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const row = await repo.create(supabase, parsed.data);
    await writeAuditLog({
      actorId: user.id,
      action: "client.create",
      entityType: "client",
      entityId: row.id,
      diff: { before: null, after: parsed.data },
    });
    revalidatePath("/clients");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "create client failed");
  }
}

export async function updateClientAction(input: {
  id: string;
  patch: unknown;
}): Promise<ActionResult<ClientRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  const parsed = clientInputSchema.safeParse(input.patch);
  if (!parsed.success) {
    return validationError(
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const before = await repo.getById(supabase, input.id);
    if (!before) return notFound();
    const row = await repo.update(supabase, input.id, parsed.data);
    await writeAuditLog({
      actorId: user.id,
      action: "client.update",
      entityType: "client",
      entityId: row.id,
      diff: diffFields(
        {
          company: before.company,
          contactName: before.contact_name,
          email: before.email,
          phone: before.phone,
          address: before.address,
          notes: before.notes,
          relationshipTag: before.relationship_tag,
        },
        parsed.data,
      ),
    });
    revalidatePath(`/clients/${input.id}`);
    revalidatePath("/clients");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "update client failed");
  }
}

export async function softDeleteClientAction(input: {
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  try {
    const before = await repo.getById(supabase, input.id);
    if (!before) return notFound();
    await repo.softDelete(supabase, input.id);
    await writeAuditLog({
      actorId: user.id,
      action: "client.soft_delete",
      entityType: "client",
      entityId: input.id,
    });
    revalidatePath("/clients");
    return ok({ id: input.id });
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "soft delete failed");
  }
}
```

- [ ] **Step 2: Write tests (mocked Supabase + repo, mirror Task 10's pattern)**

Test cases (write each, run, ensure they fail without the impl):

- `createClientAction` returns `validation` for empty company.
- `createClientAction` returns `forbidden` when no user.
- `createClientAction` calls `writeAuditLog` with `client.create` on success.
- `updateClientAction` returns `not_found` when row missing.
- `updateClientAction` writes a diff containing only changed fields.
- `softDeleteClientAction` audits `client.soft_delete`.

(Implementation of the test file follows Task 10's mock pattern exactly — repo functions mocked, supabase auth mocked, audit mocked. Engineer reuses that template.)

- [ ] **Step 3: Run, verify all pass**

Run: `pnpm test -- src/lib/actions/clients.test.ts`
Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/clients.ts src/lib/actions/clients.test.ts
git commit -m "feat: clients Server Actions with audit-log diffs"
```

---

## Task 13: Clients UI — list page

**Files:**

- Create: `src/app/(app)/layout.tsx` — auth-gated nav shell
- Create: `src/app/(app)/page.tsx` — dashboard (placeholder until Task 22)
- Create: `src/app/(app)/clients/page.tsx`

- [ ] **Step 1: Create the route group layout**

```tsx
// src/app/(app)/layout.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="grid min-h-svh grid-cols-[220px_1fr]">
      <aside className="bg-muted/30 border-r p-4">
        <div className="text-sm font-semibold">DTS Contract Engine</div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link href="/" className="hover:underline">
            Dashboard
          </Link>
          <Link href="/quotes" className="hover:underline">
            Quotes
          </Link>
          <Link href="/clients" className="hover:underline">
            Clients
          </Link>
          <Link href="/pricing" className="hover:underline">
            Pricing
          </Link>
          <Link href="/audit" className="hover:underline">
            Audit
          </Link>
        </nav>
        <form action="/auth/signout" method="post" className="mt-8">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
        <div className="text-muted-foreground mt-2 truncate text-xs">
          {user.email}
        </div>
      </aside>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Move existing home content into (app)/page.tsx**

Replace the contents of `src/app/page.tsx` with a redirect (so `/` resolves through the route group):

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";
export default function Root() {
  redirect("/");
}
```

Wait — that's a loop. Instead, **delete** `src/app/page.tsx` and let `(app)/page.tsx` own `/`:

```tsx
// src/app/(app)/page.tsx
import { createClient } from "@/lib/supabase/server";
import * as clientsRepo from "@/lib/db/clients";

export default async function Dashboard() {
  const supabase = await createClient();
  const clients = await clientsRepo.list(supabase);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Phase 1 — Quote Machine
      </p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="Clients" value={clients.length} />
        <Stat label="Quotes" value={0} />
        <Stat label="Pricing version" value="—" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums">{value}</div>
    </div>
  );
}
```

(Quote count + active pricing version filled in during Tasks 17 and 18.)

- [ ] **Step 3: Implement clients list page**

```tsx
// src/app/(app)/clients/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import * as clientsRepo from "@/lib/db/clients";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const supabase = await createClient();
  const rows = await clientsRepo.list(supabase, { search: q, tag });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button asChild>
          <Link href="/clients/new">New client</Link>
        </Button>
      </div>

      <form className="mt-4 flex gap-2" action="/clients">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search company"
          className="bg-background w-64 rounded-md border px-3 py-1.5 text-sm"
        />
        <select
          name="tag"
          defaultValue={tag}
          className="bg-background rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">All tags</option>
          <option value="standard">standard</option>
          <option value="family">family</option>
          <option value="partner">partner</option>
          <option value="high_touch">high_touch</option>
          <option value="priority">priority</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>

      <div className="mt-6 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground text-center"
                >
                  No clients yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.company}
                    </Link>
                  </TableCell>
                  <TableCell>{c.contact_name ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>{c.relationship_tag}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run dev server and verify**

```bash
pnpm dev
```

Open http://localhost:3000/clients → should show empty list with search form. http://localhost:3000/ → should show the dashboard with `Clients: 0`.

- [ ] **Step 5: Commit**

```bash
git add src/app/{layout.tsx,page.tsx,login,auth,'(app)'} 2>/dev/null
git add -A src/app
git commit -m "feat: (app) route group + clients list page"
```

---

## Task 14: Clients UI — new and detail/edit

**Files:**

- Create: `src/app/(app)/clients/new/page.tsx`
- Create: `src/app/(app)/clients/[id]/page.tsx`
- Create: `src/app/(app)/clients/[id]/edit-form.tsx`
- Create: `src/components/clients/client-form.tsx` — shared form used by `new` and `edit`

- [ ] **Step 1: Implement shared form**

```tsx
// src/components/clients/client-form.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";
import type { ClientInput } from "@/lib/schemas/client";

export type SubmitFn = (
  input: ClientInput,
) => Promise<ActionResult<{ id: string }>>;

export function ClientForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<ClientInput>;
  onSubmit: SubmitFn;
  submitLabel: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input: ClientInput = {
          company: String(fd.get("company") ?? ""),
          contactName: String(fd.get("contactName") ?? ""),
          email: String(fd.get("email") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          address: String(fd.get("address") ?? ""),
          notes: String(fd.get("notes") ?? ""),
          relationshipTag: String(
            fd.get("relationshipTag") ?? "standard",
          ) as ClientInput["relationshipTag"],
        };
        start(async () => {
          const r = await onSubmit(input);
          if (r.error) {
            if (r.error.kind === "validation") {
              const msg = Object.entries(r.error.fieldErrors)
                .map(([k, v]) => `${k}: ${v.join(", ")}`)
                .join("\n");
              toast.error(msg || "Validation error");
            } else {
              toast.error(`Error: ${r.error.kind}`);
            }
            return;
          }
          toast.success("Saved");
          router.push(`/clients/${r.data!.id}`);
        });
      }}
    >
      <Field
        label="Company"
        name="company"
        defaultValue={initial?.company}
        required
      />
      <Field
        label="Contact name"
        name="contactName"
        defaultValue={initial?.contactName}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        defaultValue={initial?.email}
      />
      <Field label="Phone" name="phone" defaultValue={initial?.phone} />
      <Field label="Address" name="address" defaultValue={initial?.address} />
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={initial?.notes}
          rows={4}
        />
      </div>
      <div>
        <Label htmlFor="relationshipTag">Relationship tag</Label>
        <Select
          name="relationshipTag"
          defaultValue={initial?.relationshipTag ?? "standard"}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">standard</SelectItem>
            <SelectItem value="family">family</SelectItem>
            <SelectItem value="partner">partner</SelectItem>
            <SelectItem value="high_touch">high_touch</SelectItem>
            <SelectItem value="priority">priority</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}
```

- [ ] **Step 2: Implement /clients/new**

```tsx
// src/app/(app)/clients/new/page.tsx
import { ClientForm } from "@/components/clients/client-form";
import { createClientAction } from "@/lib/actions/clients";

export default function NewClientPage() {
  async function action(input: Parameters<typeof createClientAction>[0]) {
    "use server";
    const r = await createClientAction(input);
    if (r.error) return r;
    return { data: { id: r.data!.id }, error: null };
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold">New client</h1>
      <div className="mt-6">
        <ClientForm onSubmit={action} submitLabel="Create client" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement /clients/[id]**

```tsx
// src/app/(app)/clients/[id]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import * as repo from "@/lib/db/clients";
import { EditClientForm } from "./edit-form";
import { Button } from "@/components/ui/button";
import { softDeleteClientAction } from "@/lib/actions/clients";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const row = await repo.getById(supabase, id);
  if (!row) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">{row.company}</h1>
      <div className="text-muted-foreground text-xs">
        Created {new Date(row.created_at).toLocaleString()}
        {row.deleted_at ? " · ARCHIVED" : ""}
      </div>
      <div className="mt-6 max-w-xl">
        <EditClientForm
          id={row.id}
          initial={{
            company: row.company,
            contactName: row.contact_name ?? "",
            email: row.email ?? "",
            phone: row.phone ?? "",
            address: row.address ?? "",
            notes: row.notes ?? "",
            relationshipTag: row.relationship_tag as "standard",
          }}
        />
      </div>
      {!row.deleted_at && (
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await softDeleteClientAction({ id });
          }}
        >
          <Button type="submit" variant="destructive" size="sm">
            Soft delete
          </Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement edit-form (delegating to ClientForm)**

```tsx
// src/app/(app)/clients/[id]/edit-form.tsx
"use client";

import { ClientForm } from "@/components/clients/client-form";
import { updateClientAction } from "@/lib/actions/clients";
import type { ClientInput } from "@/lib/schemas/client";

export function EditClientForm({
  id,
  initial,
}: {
  id: string;
  initial: ClientInput;
}) {
  return (
    <ClientForm
      initial={initial}
      submitLabel="Save changes"
      onSubmit={async (input) => updateClientAction({ id, patch: input })}
    />
  );
}
```

- [ ] **Step 5: Manual smoke test**

Run `pnpm dev`. Sign in. Create a client. Open it. Edit it. Soft-delete it. Confirm list re-renders correctly between steps.

- [ ] **Step 6: Commit**

```bash
git add -A src/app/'(app)'/clients src/components/clients
git commit -m "feat: clients new/edit/soft-delete UI"
```

---

## Task 15: Quotes repository

**Files:**

- Create: `src/lib/db/quotes.ts`
- Test: `src/lib/db/quotes.test.ts` (shape test only; integration in Task 21)

The repo handles the row mapping between `QuoteFormInput` (camelCase, validated) and the snake_case DB row, and stores `calc` as JSONB.

- [ ] **Step 1: Implement**

```ts
// src/lib/db/quotes.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalcResult,
  QuoteInput as EngineQuoteInput,
} from "@/lib/pricing/types";
import type { QuoteFormInput } from "@/lib/schemas/quote";

export type QuoteRow = {
  id: string;
  client_id: string;
  pricing_config_id: string;
  project_name: string | null;
  project_type: "marketing" | "website" | "consulting";
  tier: string | null;
  scope: EngineQuoteInput["scope"];
  multipliers: EngineQuoteInput["multipliers"];
  term: EngineQuoteInput["term"];
  custom_consulting: EngineQuoteInput["customConsulting"];
  calc: CalcResult | null;
  status: "draft" | "sent" | "signed" | "active" | "closed" | "lost" | "void";
  sent_at: string | null;
  signed_at: string | null;
  internal_notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const toEngineInput = (form: QuoteFormInput): EngineQuoteInput => ({
  projectType: form.projectType,
  tier: form.tier,
  scope: form.scope,
  multipliers: form.multipliers,
  term: form.term,
  customConsulting: form.customConsulting,
});

const toRowInsert = (
  form: QuoteFormInput,
  pricingConfigId: string,
  calc: CalcResult,
) => ({
  client_id: form.clientId,
  pricing_config_id: pricingConfigId,
  project_name: form.projectName || null,
  project_type: form.projectType,
  tier: form.tier ?? null,
  scope: form.scope ?? {},
  multipliers: form.multipliers ?? {},
  term: form.term,
  custom_consulting: form.customConsulting ?? null,
  calc,
  internal_notes: form.internalNotes || null,
  status: "draft" as const,
});

export async function list(
  client: SupabaseClient,
  opts: { status?: string; clientId?: string } = {},
): Promise<QuoteRow[]> {
  let q = client
    .schema("dts")
    .from("quotes")
    .select("*")
    .is("deleted_at", null);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QuoteRow[];
}

export async function getById(
  client: SupabaseClient,
  id: string,
): Promise<QuoteRow | null> {
  const { data, error } = await client
    .schema("dts")
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as QuoteRow | null;
}

export async function create(
  client: SupabaseClient,
  form: QuoteFormInput,
  pricingConfigId: string,
  calc: CalcResult,
): Promise<QuoteRow> {
  const { data, error } = await client
    .schema("dts")
    .from("quotes")
    .insert(toRowInsert(form, pricingConfigId, calc))
    .select("*")
    .single();
  if (error) throw error;
  return data as QuoteRow;
}

export async function update(
  client: SupabaseClient,
  id: string,
  form: QuoteFormInput,
  calc: CalcResult,
): Promise<QuoteRow> {
  const { data, error } = await client
    .schema("dts")
    .from("quotes")
    .update({
      project_name: form.projectName || null,
      tier: form.tier ?? null,
      scope: form.scope ?? {},
      multipliers: form.multipliers ?? {},
      term: form.term,
      custom_consulting: form.customConsulting ?? null,
      calc,
      internal_notes: form.internalNotes || null,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error) throw error;
  return data as QuoteRow;
}

export async function transition(
  client: SupabaseClient,
  id: string,
  to: "sent" | "lost" | "void",
): Promise<QuoteRow> {
  const patch: Record<string, unknown> = { status: to };
  if (to === "sent") patch.sent_at = new Date().toISOString();
  const { data, error } = await client
    .schema("dts")
    .from("quotes")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as QuoteRow;
}

export async function softDelete(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .schema("dts")
    .from("quotes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Surface test**

```ts
// src/lib/db/quotes.test.ts
import { describe, it, expect } from "vitest";
import * as repo from "./quotes";

describe("quotes repo surface", () => {
  it("exports the expected functions", () => {
    expect(typeof repo.list).toBe("function");
    expect(typeof repo.getById).toBe("function");
    expect(typeof repo.create).toBe("function");
    expect(typeof repo.update).toBe("function");
    expect(typeof repo.transition).toBe("function");
    expect(typeof repo.softDelete).toBe("function");
    expect(typeof repo.toEngineInput).toBe("function");
  });
});
```

- [ ] **Step 3: Run typecheck and test**

Run: `pnpm typecheck && pnpm test -- src/lib/db/quotes.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/quotes.ts src/lib/db/quotes.test.ts
git commit -m "feat: add quotes repository"
```

---

## Task 16: Quotes Server Actions

**Files:**

- Create: `src/lib/actions/quotes.ts`
- Test: `src/lib/actions/quotes.test.ts`

The action layer enforces the invariant: server always re-runs `calculate()` against the chosen pricing config. Client-supplied `calc` is ignored.

- [ ] **Step 1: Implement**

```ts
// src/lib/actions/quotes.ts
"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { quoteInputSchema, type QuoteFormInput } from "@/lib/schemas/quote";
import * as quotesRepo from "@/lib/db/quotes";
import * as pricingRepo from "@/lib/db/pricing-config";
import { writeAuditLog } from "@/lib/db/audit";
import { calculate } from "@/lib/pricing/engine";
import {
  ok,
  forbidden,
  validationError,
  notFound,
  conflict,
  unexpected,
  type ActionResult,
} from "./result";
import type { QuoteRow } from "@/lib/db/quotes";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const VALID_TRANSITIONS: Record<
  QuoteRow["status"],
  readonly ("sent" | "lost" | "void")[]
> = {
  draft: ["sent", "lost", "void"],
  sent: ["lost", "void"],
  signed: [],
  active: [],
  closed: [],
  lost: [],
  void: [],
};

export async function createQuoteAction(
  input: unknown,
): Promise<ActionResult<QuoteRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const active = await pricingRepo.getActive(supabase);
    if (!active) return conflict("No active pricing config — seed it first");
    const calc = calculate(
      quotesRepo.toEngineInput(parsed.data),
      active.config,
    );
    const row = await quotesRepo.create(supabase, parsed.data, active.id, calc);
    await writeAuditLog({
      actorId: user.id,
      action: "quote.create",
      entityType: "quote",
      entityId: row.id,
      diff: { input: parsed.data, pricingConfigId: active.id },
    });
    revalidatePath("/quotes");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "create quote failed");
  }
}

export async function updateQuoteAction(input: {
  id: string;
  patch: unknown;
}): Promise<ActionResult<QuoteRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  const parsed = quoteInputSchema.safeParse(input.patch);
  if (!parsed.success) {
    return validationError(
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  try {
    const before = await quotesRepo.getById(supabase, input.id);
    if (!before) return notFound();
    if (before.status !== "draft")
      return conflict(`Cannot edit quote in status ${before.status}`);

    const config = await pricingRepo.getById(
      supabase,
      before.pricing_config_id,
    );
    if (!config) return conflict("Quote's pricing config no longer exists");

    const calc = calculate(
      quotesRepo.toEngineInput(parsed.data),
      config.config,
    );
    const row = await quotesRepo.update(supabase, input.id, parsed.data, calc);
    await writeAuditLog({
      actorId: user.id,
      action: "quote.update",
      entityType: "quote",
      entityId: row.id,
      diff: { input: parsed.data },
    });
    revalidatePath(`/quotes/${input.id}`);
    revalidatePath("/quotes");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "update quote failed");
  }
}

export async function duplicateQuoteAction(input: {
  id: string;
}): Promise<ActionResult<QuoteRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  try {
    const src = await quotesRepo.getById(supabase, input.id);
    if (!src) return notFound();
    const active = await pricingRepo.getActive(supabase);
    if (!active) return conflict("No active pricing config");

    const form: QuoteFormInput = {
      clientId: src.client_id,
      projectName: src.project_name ?? "",
      projectType: src.project_type,
      tier: src.tier ?? undefined,
      scope: src.scope ?? {},
      multipliers: src.multipliers ?? {},
      term: src.term,
      customConsulting: src.custom_consulting ?? undefined,
      internalNotes: src.internal_notes ?? "",
    };
    const calc = calculate(quotesRepo.toEngineInput(form), active.config);
    const row = await quotesRepo.create(supabase, form, active.id, calc);
    await writeAuditLog({
      actorId: user.id,
      action: "quote.duplicate",
      entityType: "quote",
      entityId: row.id,
      diff: { fromId: src.id },
    });
    revalidatePath("/quotes");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "duplicate failed");
  }
}

export async function transitionQuoteAction(input: {
  id: string;
  to: "sent" | "lost" | "void";
  reason?: string;
}): Promise<ActionResult<QuoteRow>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  try {
    const before = await quotesRepo.getById(supabase, input.id);
    if (!before) return notFound();
    const allowed = VALID_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(input.to))
      return conflict(`Cannot transition ${before.status} → ${input.to}`);
    const row = await quotesRepo.transition(supabase, input.id, input.to);
    await writeAuditLog({
      actorId: user.id,
      action: "quote.transition",
      entityType: "quote",
      entityId: row.id,
      diff: { from: before.status, to: input.to, reason: input.reason ?? null },
    });
    revalidatePath(`/quotes/${input.id}`);
    revalidatePath("/quotes");
    return ok(row);
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "transition failed");
  }
}

export async function softDeleteQuoteAction(input: {
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return forbidden();

  try {
    const before = await quotesRepo.getById(supabase, input.id);
    if (!before) return notFound();
    if (!["draft", "lost", "void"].includes(before.status))
      return conflict("Mark quote void or lost before deleting");
    await quotesRepo.softDelete(supabase, input.id);
    await writeAuditLog({
      actorId: user.id,
      action: "quote.soft_delete",
      entityType: "quote",
      entityId: input.id,
    });
    revalidatePath("/quotes");
    return ok({ id: input.id });
  } catch (e) {
    return unexpected(e instanceof Error ? e.message : "soft delete failed");
  }
}
```

- [ ] **Step 2: Test cases (mock pattern from Task 10)**

Write tests covering:

1. `createQuoteAction` validates input and calls `calculate` against active config.
2. `createQuoteAction` returns `conflict` if no active pricing config.
3. `updateQuoteAction` returns `conflict` if quote is `sent` (not draft).
4. `updateQuoteAction` uses the quote's _frozen_ `pricing_config_id`, not active.
5. `transitionQuoteAction` rejects `signed → lost`.
6. `transitionQuoteAction` allows `draft → sent` and writes audit with from/to.
7. `softDeleteQuoteAction` rejects `sent` quotes.

(Engineer follows the Task 10 mocking pattern. ~120 lines of test code.)

- [ ] **Step 3: Run, verify all pass**

Run: `pnpm test -- src/lib/actions/quotes.test.ts`
Expected: 7 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/quotes.ts src/lib/actions/quotes.test.ts
git commit -m "feat: quote Server Actions with re-base safety + transition validation"
```

---

## Task 17: Quote builder UI

**Files:**

- Create: `src/components/quotes/quote-builder.tsx` — client component, runs `calculate()` live
- Create: `src/app/(app)/quotes/new/page.tsx`
- Create: `src/app/(app)/quotes/[id]/page.tsx`
- Create: `src/app/(app)/quotes/[id]/builder.tsx` — wraps QuoteBuilder for edit
- Create: `src/app/(app)/quotes/page.tsx` — list

This is the largest UI piece. Key design points:

- The Server Component fetches the relevant `pricing_config` (active for new, frozen for edit) and the client.
- It passes the JSON config + clientId + initial form state to a client component.
- The client component holds form state and runs `calculate()` in a `useMemo` for live totals.
- Save calls the Server Action; the server re-runs `calculate()` and ignores client-supplied calc.

- [ ] **Step 1: Implement the builder client component**

```tsx
// src/components/quotes/quote-builder.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculate, formatCents } from "@/lib/pricing/engine";
import type { PricingConfig } from "@/lib/pricing/types";
import type { QuoteFormInput } from "@/lib/schemas/quote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";

export type BuilderSubmit = (
  form: QuoteFormInput,
) => Promise<ActionResult<{ id: string }>>;

export function QuoteBuilder({
  config,
  clientId,
  initial,
  submitLabel,
  onSubmit,
  readOnly = false,
}: {
  config: PricingConfig;
  clientId: string;
  initial?: Partial<QuoteFormInput>;
  submitLabel: string;
  onSubmit: BuilderSubmit;
  readOnly?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const [form, setForm] = useState<QuoteFormInput>({
    clientId,
    projectName: initial?.projectName ?? "",
    projectType: initial?.projectType ?? "marketing",
    tier: initial?.tier ?? "growth",
    scope: initial?.scope ?? {},
    multipliers: initial?.multipliers ?? {
      rush: 0,
      highTouch: 0,
      familyCourtesy: 0,
    },
    term: initial?.term ?? "monthly",
    customConsulting: initial?.customConsulting,
    internalNotes: initial?.internalNotes ?? "",
  });

  const calc = useMemo(
    () =>
      calculate(
        {
          projectType: form.projectType,
          tier: form.tier,
          scope: form.scope,
          multipliers: form.multipliers,
          term: form.term,
          customConsulting: form.customConsulting,
        },
        config,
      ),
    [form, config],
  );

  const toggleSetup = (id: string) =>
    setForm((f) => ({
      ...f,
      scope: {
        ...f.scope,
        setup: {
          ...(f.scope?.setup ?? {}),
          [id]: { enabled: !f.scope?.setup?.[id]?.enabled },
        },
      },
    }));

  const setMultiplier = (
    k: "rush" | "highTouch" | "familyCourtesy",
    v: number,
  ) =>
    setForm((f) => ({
      ...f,
      multipliers: { ...(f.multipliers ?? {}), [k]: v },
    }));

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8">
      <div className="space-y-6">
        <div>
          <Label>Project name</Label>
          <Input
            value={form.projectName ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              setForm((f) => ({ ...f, projectName: e.target.value }))
            }
          />
        </div>

        <div>
          <Label>Project type</Label>
          <Select
            value={form.projectType}
            disabled={readOnly}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                projectType: v as QuoteFormInput["projectType"],
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="marketing">
                {config.projectTypes.marketing.label}
              </SelectItem>
              <SelectItem value="website">
                {config.projectTypes.website.label}
              </SelectItem>
              <SelectItem value="consulting">
                {config.projectTypes.consulting.label}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.projectType === "marketing" && (
          <div>
            <Label>Tier</Label>
            <Select
              value={form.tier ?? "growth"}
              disabled={readOnly}
              onValueChange={(v) => setForm((f) => ({ ...f, tier: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(config.tiers).map(([k, t]) => (
                  <SelectItem key={k} value={k}>
                    {t.name} — {formatCents(t.monthlyRetainerCents)}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Setup items</Label>
          <div className="mt-2 space-y-2">
            {config.setupItems.map((it) => (
              <label key={it.id} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={form.scope?.setup?.[it.id]?.enabled ?? false}
                  disabled={readOnly}
                  onCheckedChange={() => toggleSetup(it.id)}
                />
                <span className="flex-1">{it.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCents(it.priceCents)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>Term</Label>
          <Select
            value={form.term}
            disabled={readOnly}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, term: v as QuoteFormInput["term"] }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.termOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {(["rush", "highTouch", "familyCourtesy"] as const).map((k) => {
            const m = config.multipliers[k];
            const v = form.multipliers?.[k] ?? 0;
            return (
              <div key={k}>
                <Label>
                  {m.label} ({v}%)
                </Label>
                <Slider
                  min={0}
                  max={m.max}
                  step={1}
                  value={[v]}
                  disabled={readOnly}
                  onValueChange={([nv]) => setMultiplier(k, nv)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <aside className="space-y-2 rounded-lg border p-4">
        <div className="text-muted-foreground text-xs uppercase">
          Live totals
        </div>
        <Total label="Setup total" value={calc.setupTotalCents} />
        <Total label="Monthly total" value={calc.monthlyTotalCents} />
        {calc.familyDiscountAmountCents > 0 && (
          <Total
            label="Family courtesy"
            value={-calc.familyDiscountAmountCents}
            muted
          />
        )}
        <Total label="First month" value={calc.firstMonthTotalCents} />
        <Total label="Year 1" value={calc.year1TotalCents} />
        <Total label="Deposit" value={calc.depositAmountCents} muted />

        {!readOnly && (
          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await onSubmit(form);
                if (r.error) {
                  toast.error(
                    `Error: ${r.error.kind}${"message" in r.error ? ` — ${r.error.message}` : ""}`,
                  );
                  return;
                }
                toast.success("Saved");
                router.push(`/quotes/${r.data!.id}`);
              })
            }
          >
            {submitLabel}
          </Button>
        )}
      </aside>
    </div>
  );
}

function Total({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${muted ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatCents(value)}</span>
    </div>
  );
}
```

(This is a focused-but-not-complete builder — Phase 1 supports marketing/tier/setup/term/multipliers, which covers the spec's acceptance criterion. Recurring add-ons, website templates, and consulting hours sections follow the same pattern. Add them as you go; each is ~15 lines of UI mirroring `setupItems`. Keep them in this single file; do not split until it exceeds ~600 lines.)

- [ ] **Step 2: Implement /quotes/new**

```tsx
// src/app/(app)/quotes/new/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import * as pricingRepo from "@/lib/db/pricing-config";
import * as clientsRepo from "@/lib/db/clients";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { createQuoteAction } from "@/lib/actions/quotes";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  if (!clientId) redirect("/clients");

  const supabase = await createClient();
  const [active, client] = await Promise.all([
    pricingRepo.getActive(supabase),
    clientsRepo.getById(supabase, clientId),
  ]);
  if (!active) return <div>No active pricing config — seed it first.</div>;
  if (!client) redirect("/clients");

  return (
    <div>
      <h1 className="text-2xl font-semibold">New quote · {client.company}</h1>
      <div className="mt-6">
        <QuoteBuilder
          config={active.config}
          clientId={clientId}
          submitLabel="Save draft"
          onSubmit={async (form) => {
            "use server";
            const r = await createQuoteAction(form);
            return r.error ? r : { data: { id: r.data!.id }, error: null };
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement /quotes/[id]**

```tsx
// src/app/(app)/quotes/[id]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import * as quotesRepo from "@/lib/db/quotes";
import * as pricingRepo from "@/lib/db/pricing-config";
import * as clientsRepo from "@/lib/db/clients";
import { QuoteEditor } from "./builder";
import { TransitionButtons } from "./transitions";

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const quote = await quotesRepo.getById(supabase, id);
  if (!quote) notFound();
  const [config, client] = await Promise.all([
    pricingRepo.getById(supabase, quote.pricing_config_id),
    clientsRepo.getById(supabase, quote.client_id),
  ]);
  if (!config || !client) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {quote.project_name || "Quote"} · {client.company}
      </h1>
      <div className="text-muted-foreground text-xs">
        Status: <span className="font-medium uppercase">{quote.status}</span>·
        Pricing v{config.version}
      </div>

      <div className="mt-6">
        <QuoteEditor
          quoteId={quote.id}
          config={config.config}
          clientId={quote.client_id}
          initial={{
            projectName: quote.project_name ?? "",
            projectType: quote.project_type,
            tier: quote.tier ?? undefined,
            scope: quote.scope ?? {},
            multipliers: quote.multipliers ?? {},
            term: quote.term,
            customConsulting: quote.custom_consulting ?? undefined,
            internalNotes: quote.internal_notes ?? "",
          }}
          readOnly={quote.status !== "draft"}
        />
      </div>

      <div className="mt-8">
        <TransitionButtons id={quote.id} status={quote.status} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement editor wrapper**

```tsx
// src/app/(app)/quotes/[id]/builder.tsx
"use client";

import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { updateQuoteAction } from "@/lib/actions/quotes";
import type { QuoteFormInput } from "@/lib/schemas/quote";
import type { PricingConfig } from "@/lib/pricing/types";

export function QuoteEditor({
  quoteId,
  config,
  clientId,
  initial,
  readOnly,
}: {
  quoteId: string;
  config: PricingConfig;
  clientId: string;
  initial: Partial<QuoteFormInput>;
  readOnly: boolean;
}) {
  return (
    <QuoteBuilder
      config={config}
      clientId={clientId}
      initial={initial}
      submitLabel="Save changes"
      readOnly={readOnly}
      onSubmit={async (form) => {
        const r = await updateQuoteAction({ id: quoteId, patch: form });
        return r.error ? r : { data: { id: r.data!.id }, error: null };
      }}
    />
  );
}
```

- [ ] **Step 5: Implement transition buttons**

```tsx
// src/app/(app)/quotes/[id]/transitions.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  transitionQuoteAction,
  duplicateQuoteAction,
  softDeleteQuoteAction,
} from "@/lib/actions/quotes";
import { toast } from "sonner";

export function TransitionButtons({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const fire = (
    fn: () => Promise<{ error: { kind: string } | null; data: unknown }>,
    ok: string,
  ) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(`Error: ${r.error.kind}`);
      else {
        toast.success(ok);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <>
          <Button
            disabled={pending}
            onClick={() =>
              fire(
                () => transitionQuoteAction({ id, to: "sent" }),
                "Marked sent",
              )
            }
          >
            Mark sent
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              const reason =
                prompt("Reason for losing this quote?") ?? undefined;
              fire(
                () => transitionQuoteAction({ id, to: "lost", reason }),
                "Marked lost",
              );
            }}
          >
            Mark lost
          </Button>
        </>
      )}
      {(status === "draft" || status === "sent") && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            const reason = prompt("Reason for voiding?") ?? undefined;
            fire(
              () => transitionQuoteAction({ id, to: "void", reason }),
              "Voided",
            );
          }}
        >
          Void
        </Button>
      )}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          fire(async () => {
            const r = await duplicateQuoteAction({ id });
            if (!r.error) router.push(`/quotes/${r.data!.id}`);
            return r;
          }, "Duplicated")
        }
      >
        Duplicate
      </Button>
      {(status === "draft" || status === "lost" || status === "void") && (
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            fire(async () => {
              const r = await softDeleteQuoteAction({ id });
              if (!r.error) router.push("/quotes");
              return r;
            }, "Deleted")
          }
        >
          Soft delete
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Implement /quotes list**

```tsx
// src/app/(app)/quotes/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import * as quotesRepo from "@/lib/db/quotes";
import * as clientsRepo from "@/lib/db/clients";
import { formatCents } from "@/lib/pricing/engine";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const rows = await quotesRepo.list(supabase, { status });
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
  const clients = await Promise.all(
    clientIds.map((id) => clientsRepo.getById(supabase, id)),
  );
  const clientById = new Map(clients.filter(Boolean).map((c) => [c!.id, c!]));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Quotes</h1>
      <form className="mt-4 flex gap-2" action="/quotes">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="bg-background rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">All</option>
          {["draft", "sent", "lost", "void"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-md border px-3 py-1.5 text-sm">Apply</button>
      </form>
      <div className="mt-6 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="text-right">Year 1</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground text-center"
                >
                  No quotes yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link href={`/quotes/${q.id}`} className="hover:underline">
                      {q.project_name || "(untitled)"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {clientById.get(q.client_id)?.company ?? "—"}
                    {clientById.get(q.client_id)?.deleted_at && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        archived
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs uppercase">{q.status}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {q.calc ? formatCents(q.calc.monthlyTotalCents) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {q.calc ? formatCents(q.calc.year1TotalCents) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Manual smoke test the full flow**

```bash
pnpm dev
```

Sign in. Create a client. From `/clients/[id]`, click a "New quote for this client" link (add a button to the detail page if it doesn't exist yet). Build a quote — see live totals update. Save. Open the saved quote, verify the totals match. Edit a slider, save, see updated calc. Mark sent. Try to edit — fields should be disabled.

- [ ] **Step 8: Add "New quote" button to /clients/[id]**

Modify `src/app/(app)/clients/[id]/page.tsx` to add a Link button:

```tsx
<Button asChild variant="outline" size="sm" className="ml-2">
  <Link href={`/quotes/new?clientId=${row.id}`}>New quote</Link>
</Button>
```

(Place it next to the soft-delete button.)

- [ ] **Step 9: Commit**

```bash
git add -A src/app/'(app)'/quotes src/components/quotes src/app/'(app)'/clients/'[id]'/page.tsx
git commit -m "feat: quote builder, list, detail, transitions"
```

---

## Task 18: Pricing-config admin UI

**Files:**

- Create: `src/app/(app)/pricing/page.tsx`
- Create: `src/app/(app)/pricing/new/page.tsx`
- Create: `src/app/(app)/pricing/[id]/page.tsx`
- Create: `src/components/pricing/json-editor.tsx`

For the JSON editor, use **CodeMirror** via `@uiw/react-codemirror` + `@codemirror/lang-json` — smaller bundle than Monaco, plays nicely with Next 15 SSR via dynamic import.

- [ ] **Step 1: Add CodeMirror deps**

```bash
pnpm add @uiw/react-codemirror @codemirror/lang-json
```

- [ ] **Step 2: Implement editor**

```tsx
// src/components/pricing/json-editor.tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { json } from "@codemirror/lang-json";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
});

export function PricingJsonEditor({
  initialJson,
  onSubmit,
  submitLabel,
  readOnly = false,
}: {
  initialJson: string;
  onSubmit: (parsed: unknown) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(initialJson);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <CodeMirror
        value={text}
        height="600px"
        extensions={[json()]}
        readOnly={readOnly}
        onChange={(v) => setText(v)}
      />
      {!readOnly && (
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              let parsed: unknown;
              try {
                parsed = JSON.parse(text);
              } catch (e) {
                toast.error("Invalid JSON: " + (e as Error).message);
                return;
              }
              const r = await onSubmit(parsed);
              if (r.error) {
                if (r.error.kind === "validation") {
                  toast.error(
                    "Schema errors: " +
                      JSON.stringify(r.error.fieldErrors).slice(0, 200),
                  );
                } else toast.error(`Error: ${r.error.kind}`);
                return;
              }
              toast.success("Saved");
              router.push(`/pricing/${r.data!.id}`);
            })
          }
        >
          {submitLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement /pricing list**

```tsx
// src/app/(app)/pricing/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import * as repo from "@/lib/db/pricing-config";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export default async function PricingPage() {
  const supabase = await createClient();
  const rows = await repo.list(supabase);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pricing config</h1>
        <Button asChild>
          <Link href="/pricing/new">New draft</Link>
        </Button>
      </div>
      <div className="mt-6 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/pricing/${r.id}`} className="hover:underline">
                    v{r.version}
                  </Link>
                </TableCell>
                <TableCell>{r.is_active ? "ACTIVE" : ""}</TableCell>
                <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement /pricing/new**

```tsx
// src/app/(app)/pricing/new/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import * as repo from "@/lib/db/pricing-config";
import { PricingJsonEditor } from "@/components/pricing/json-editor";
import { createPricingDraftAction } from "@/lib/actions/pricing-config";

export default async function NewPricingPage() {
  const supabase = await createClient();
  const active = await repo.getActive(supabase);
  if (!active) redirect("/pricing");
  const initial = JSON.stringify(active.config, null, 2);

  return (
    <div>
      <h1 className="text-2xl font-semibold">New pricing draft</h1>
      <div className="text-muted-foreground mt-1 text-sm">
        Seeded from active v{active.version}.
      </div>
      <div className="mt-6">
        <PricingJsonEditor
          initialJson={initial}
          submitLabel="Save draft"
          onSubmit={async (config) => {
            "use server";
            const r = await createPricingDraftAction({ config });
            return r.error ? r : { data: { id: r.data!.id }, error: null };
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement /pricing/[id]**

```tsx
// src/app/(app)/pricing/[id]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import * as repo from "@/lib/db/pricing-config";
import { PricingJsonEditor } from "@/components/pricing/json-editor";
import {
  updatePricingDraftAction,
  publishPricingVersionAction,
} from "@/lib/actions/pricing-config";
import { Button } from "@/components/ui/button";

export default async function PricingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const row = await repo.getById(supabase, id);
  if (!row) notFound();
  const initial = JSON.stringify(row.config, null, 2);

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        Pricing v{row.version} {row.is_active ? "(ACTIVE)" : "(draft)"}
      </h1>
      <div className="mt-6">
        <PricingJsonEditor
          initialJson={initial}
          submitLabel="Save draft"
          readOnly={row.is_active}
          onSubmit={async (config) => {
            "use server";
            const r = await updatePricingDraftAction({ id, config });
            return r.error ? r : { data: { id: r.data!.id }, error: null };
          }}
        />
      </div>

      {!row.is_active && (
        <form
          className="mt-4"
          action={async () => {
            "use server";
            await publishPricingVersionAction({ id });
          }}
        >
          <Button type="submit">Publish v{row.version}</Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Manual smoke test**

`/pricing` lists v1 ACTIVE. Create draft → opens v2 in editor pre-filled. Edit a tier price. Save → redirects to /pricing/[id] in draft state. Publish → /pricing list shows v2 ACTIVE, v1 not. Audit page (Task 19) will show three events.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/'(app)'/pricing src/components/pricing package.json pnpm-lock.yaml
git commit -m "feat: pricing-config admin UI with CodeMirror JSON editor"
```

---

## Task 19: Audit log UI

**Files:**

- Create: `src/lib/db/audit-log.ts` (read-only repo)
- Create: `src/app/(app)/audit/page.tsx`

- [ ] **Step 1: Implement read repo**

```ts
// src/lib/db/audit-log.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  diff: unknown;
  occurred_at: string;
};

export async function recent(
  client: SupabaseClient,
  opts: { limit?: number; entityType?: string; entityId?: string } = {},
): Promise<AuditRow[]> {
  let q = client.schema("dts").from("audit_log").select("*");
  if (opts.entityType) q = q.eq("entity_type", opts.entityType);
  if (opts.entityId) q = q.eq("entity_id", opts.entityId);
  const { data, error } = await q
    .order("occurred_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}
```

- [ ] **Step 2: Implement /audit page**

```tsx
// src/app/(app)/audit/page.tsx
import { createClient } from "@/lib/supabase/server";
import * as repo from "@/lib/db/audit-log";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const { entityType, entityId } = await searchParams;
  const supabase = await createClient();
  const rows = await repo.recent(supabase, { entityType, entityId });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <form className="mt-4 flex gap-2 text-sm">
        <input
          name="entityType"
          placeholder="entity_type"
          defaultValue={entityType ?? ""}
          className="bg-background rounded-md border px-2 py-1"
        />
        <input
          name="entityId"
          placeholder="entity_id"
          defaultValue={entityId ?? ""}
          className="bg-background rounded-md border px-2 py-1"
        />
        <button className="rounded-md border px-3 py-1">Filter</button>
      </form>
      <div className="mt-6 space-y-2 text-sm">
        {rows.length === 0 && (
          <div className="text-muted-foreground">No audit entries match.</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded border p-3 font-mono">
            <div className="flex justify-between">
              <span className="font-semibold">{r.action}</span>
              <span className="text-muted-foreground text-xs">
                {new Date(r.occurred_at).toISOString()}
              </span>
            </div>
            <div className="text-xs">
              {r.entity_type}/{r.entity_id} · actor {r.actor_id ?? "system"}
            </div>
            {r.diff != null && (
              <pre className="bg-muted/40 mt-2 overflow-auto rounded p-2 text-xs">
                {JSON.stringify(r.diff, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire dashboard quote count + active pricing version**

Update `src/app/(app)/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import * as clientsRepo from "@/lib/db/clients";
import * as quotesRepo from "@/lib/db/quotes";
import * as pricingRepo from "@/lib/db/pricing-config";

export default async function Dashboard() {
  const supabase = await createClient();
  const [clients, quotes, active] = await Promise.all([
    clientsRepo.list(supabase),
    quotesRepo.list(supabase),
    pricingRepo.getActive(supabase),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="Clients" value={clients.length} />
        <Stat label="Quotes" value={quotes.length} />
        <Stat label="Pricing" value={active ? `v${active.version}` : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A src/app/'(app)' src/lib/db/audit-log.ts
git commit -m "feat: audit log UI + dashboard wired up"
```

---

## Task 20: RLS test SQL

**Files:**

- Create: `supabase/tests/rls.sql`
- Modify: `package.json` (add `test:rls`)

- [ ] **Step 1: Write rls.sql**

```sql
-- supabase/tests/rls.sql
-- Run against a fresh local Supabase instance after migrations + seed.
-- Asserts the RLS posture documented in the Phase 1 design.

\set ON_ERROR_STOP on

BEGIN;

-- Helper: assert
CREATE OR REPLACE FUNCTION pg_temp.must_fail(sql text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE sql;
    RAISE EXCEPTION 'expected % to fail under RLS but it succeeded', sql;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    -- expected
    NULL;
  END;
END $$ LANGUAGE plpgsql;

-- 1) anon cannot read clients
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dts.clients;
  IF n <> 0 THEN
    RAISE EXCEPTION 'anon should see 0 clients, saw %', n;
  END IF;
END $$;

-- 2) authenticated has full access (impersonate by setting jwt claims)
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}';

INSERT INTO dts.clients (company, relationship_tag) VALUES ('RLS Test Co', 'standard');
SELECT count(*) FROM dts.clients WHERE company = 'RLS Test Co';

-- 3) authenticated cannot insert into audit_log
SELECT pg_temp.must_fail($$
  INSERT INTO dts.audit_log (action, entity_type, entity_id) VALUES ('x', 'y', gen_random_uuid())
$$);

-- 4) authenticated CAN read audit_log
SELECT count(*) FROM dts.audit_log;

ROLLBACK;
```

- [ ] **Step 2: Add npm script**

```json
"test:rls": "supabase db reset && psql $SUPABASE_DB_URL -f supabase/tests/rls.sql"
```

(Local devs may need to set `SUPABASE_DB_URL` to the local instance URL printed by `supabase status`.)

- [ ] **Step 3: Run locally if you have local Supabase**

```bash
pnpm test:rls
```

Expected: completes without `RAISE EXCEPTION`. If you don't have local Supabase up, skip — CI runs this in Task 23.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls.sql package.json
git commit -m "test(rls): assert single-owner posture for dts schema"
```

---

## Task 21: Repository integration tests with local Supabase

**Files:**

- Create: `src/lib/db/__integration__/setup.ts` — boots a per-suite Supabase test instance using @supabase/supabase-js against `SUPABASE_TEST_URL`
- Create: `src/lib/db/__integration__/clients.int.test.ts`
- Create: `src/lib/db/__integration__/quotes.int.test.ts`
- Modify: `vitest.config.ts` to register the integration project gated on env

- [ ] **Step 1: Add a separate Vitest project for integration**

Modify `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    exclude: ["e2e/**", "**/node_modules/**"],
    projects: [
      {
        name: "unit",
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        exclude: ["src/lib/db/__integration__/**"],
      },
      {
        name: "integration",
        include: ["src/lib/db/__integration__/**/*.int.test.ts"],
        env: { SUPABASE_INT: "1" },
      },
    ],
  },
});
```

(If `vitest.config.ts` doesn't yet have `projects`, add it in the same shape as the spec above. Keep all existing options.)

- [ ] **Step 2: Implement test setup**

```ts
// src/lib/db/__integration__/setup.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;

export const skipIntegration = !url || !key;

export const integrationClient = () => {
  if (skipIntegration)
    throw new Error("Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY");
  return createClient(url!, key!);
};
```

- [ ] **Step 3: Implement clients integration test**

```ts
// src/lib/db/__integration__/clients.int.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationClient, skipIntegration } from "./setup";
import * as repo from "../clients";

describe.skipIf(skipIntegration)("clients integration", () => {
  let id: string;

  it("create -> getById -> update -> softDelete", async () => {
    const c = integrationClient();
    const created = await repo.create(c, {
      company: "Int Test " + Date.now(),
      relationshipTag: "standard",
    } as never);
    id = created.id;
    expect(created.company).toMatch(/^Int Test/);

    const fetched = await repo.getById(c, id);
    expect(fetched?.id).toBe(id);

    const updated = await repo.update(c, id, {
      company: "Renamed",
      relationshipTag: "family",
    } as never);
    expect(updated.relationship_tag).toBe("family");

    await repo.softDelete(c, id);
    const afterDelete = await repo.getById(c, id);
    expect(afterDelete?.deleted_at).not.toBeNull();
  });
});
```

- [ ] **Step 4: Implement quotes integration test**

(Mirrors clients: create a client, create a quote against the active pricing config, edit, transition draft→sent, verify edit then fails, soft delete fails (sent), transition sent→void, soft delete succeeds.)

- [ ] **Step 5: Run locally if you have a test instance**

```bash
SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_KEY=... pnpm test --project integration
```

If skipped, no failure.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/db/__integration__
git commit -m "test: add integration tests for clients + quotes repos"
```

---

## Task 22: Bundle audit test

**Files:**

- Create: `src/lib/security/bundle-audit.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/lib/security/bundle-audit.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const STATIC_DIR = path.resolve(".next/static");

const SECRETS = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.CLIENT_PORTAL_JWT_SECRET,
  process.env.STRIPE_SECRET_KEY,
  process.env.DOCUSEAL_API_KEY,
  process.env.DOCUSEAL_WEBHOOK_SECRET,
  process.env.RESEND_API_KEY,
  process.env.SENTRY_AUTH_TOKEN,
].filter((v): v is string => typeof v === "string" && v.length > 8);

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const buildExists = () => {
  try {
    statSync(STATIC_DIR);
    return true;
  } catch {
    return false;
  }
};

describe("bundle audit", () => {
  it.skipIf(!buildExists() || SECRETS.length === 0)(
    "no server-only secret leaks into .next/static",
    () => {
      for (const file of walk(STATIC_DIR)) {
        if (!/\.(js|mjs|css|map)$/.test(file)) continue;
        const content = readFileSync(file, "utf8");
        for (const secret of SECRETS) {
          if (content.includes(secret)) {
            throw new Error(`secret leaked into ${file}`);
          }
        }
      }
    },
  );
});
```

- [ ] **Step 2: Wire into CI**

Modify `.github/workflows/ci.yml` `verify` job — after `pnpm build`, add:

```yaml
- name: Bundle audit
  run: pnpm test -- src/lib/security/bundle-audit.test.ts
  env:
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    # other secrets only if you want them asserted; safe to leave unset
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/security/bundle-audit.test.ts .github/workflows/ci.yml
git commit -m "test: add bundle audit to catch server-only secret leaks"
```

---

## Task 23: CI updates — RLS + integration

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a `db_tests` job**

Append to ci.yml:

```yaml
db_tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: supabase/postgres:15.1.1.78
      env:
        POSTGRES_PASSWORD: postgres
      ports:
        - 5432:5432
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - name: Apply migrations
      run: |
        export PGPASSWORD=postgres
        for f in supabase/migrations/*.sql; do
          psql -h localhost -U postgres -d postgres -f "$f"
        done
    - name: Seed pricing config
      run: pnpm seed:pricing
      env:
        NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
        SUPABASE_SERVICE_ROLE_KEY: dummy-not-used-in-this-job
    - name: Run RLS tests
      run: psql -h localhost -U postgres -d postgres -f supabase/tests/rls.sql
      env: { PGPASSWORD: postgres }
```

(The seed step may need adjustment depending on whether you can point the seed script at a bare Postgres instance — for the CI gate the rls.sql is the primary signal; the integration tests against a real Supabase test project run in a separate workflow not gated on this PR.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate on RLS tests against ephemeral Postgres"
```

---

## Task 24: E2E test — golden path

**Files:**

- Create: `e2e/quote-machine.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/quote-machine.spec.ts
import { test, expect } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.skip(!email || !password, "E2E creds not set");

test("create client → build quote → mark sent", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/clients/new");
  const co = `E2E Co ${Date.now()}`;
  await page.getByLabel(/company/i).fill(co);
  await page.getByRole("button", { name: /create client/i }).click();
  await expect(page.getByRole("heading", { name: co })).toBeVisible();

  await page.getByRole("link", { name: /new quote/i }).click();
  await page.getByLabel(/project name/i).fill("E2E Quote");
  await page.getByRole("button", { name: /save draft/i }).click();
  await expect(page.getByText(/STATUS:\s*DRAFT/i)).toBeVisible();

  await page.getByRole("button", { name: /mark sent/i }).click();
  await expect(page.getByText(/STATUS:\s*SENT/i)).toBeVisible();

  await page.goto("/quotes");
  await expect(page.getByText("E2E Quote")).toBeVisible();
});
```

- [ ] **Step 2: Run locally against dev**

```bash
pnpm dev &
E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... pnpm test:e2e
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/quote-machine.spec.ts
git commit -m "test(e2e): golden path — client → quote → sent"
```

---

## Task 25: Documentation update

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/SETUP.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Append a new section after "App-layer conventions":

```markdown
### Phase 1 layout (current)

- Repositories live in `src/lib/db/*` and accept a Supabase client; they never construct one.
- Server Actions in `src/lib/actions/*` return `ActionResult<T>` (see `src/lib/actions/result.ts`). They are the only place that calls repos and audit.
- Service-role Supabase client (`src/lib/supabase/service.ts`) is **only** importable from `src/lib/db/audit.ts` (ESLint-enforced).
- The pricing engine is loaded into the browser bundle for live builder totals — it has no I/O and no secrets, and the bundle audit test asserts nothing else leaks.
- `dts.publish_pricing_version(uuid)` (migration 0002) is the only writer that flips `is_active` on `pricing_config`.
```

- [ ] **Step 2: Update docs/SETUP.md**

Add to the "Where to look when things break" table:

```markdown
| `pnpm test:rls` errors with "role anon does not exist" | Run against a fresh `supabase db reset` — local Supabase needs to be up |
| Quote save returns "No active pricing config" | Run `pnpm seed:pricing` once after fresh DB |
| ESLint blocks `@/lib/supabase/service` import | Move the audit-log code into `src/lib/db/audit.ts` — that's the only allowed importer |
```

Add a new section "First-run after Phase 1 deploy":

```markdown
## First-run after Phase 1 deploy

Once Phase 1 lands and migrations are applied:

1. `pnpm seed:pricing` (with `SUPABASE_SERVICE_ROLE_KEY` set) — seeds `pricing_config` v1.
2. Sign in to the production URL with your seeded Supabase auth user.
3. Create your first client.
4. Build a draft quote and verify the totals match the engine fixtures (run `pnpm test -- engine.test.ts` for the canonical numbers).
```

- [ ] **Step 3: Update README.md status**

Replace the "**Status**" line:

```markdown
**Status:** Phase 1 (clients, pricing-config admin, quote builder) complete. Phase 2 (contract lifecycle, DocuSeal) is the next milestone.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/SETUP.md README.md
git commit -m "docs: update for Phase 1 quote machine"
```

---

## Final acceptance checklist

After all 25 tasks:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm test --project unit` — all green; new tests cover schemas, actions, audit helper, repo surfaces.
- [ ] `pnpm test --project integration` — green when env set; skipped otherwise.
- [ ] `pnpm test:rls` — green against a local Supabase instance.
- [ ] `pnpm build` — clean; bundle audit test passes.
- [ ] Manual flow per spec § Acceptance criteria — all 9 items pass against the deployed `https://contracts.dobeu.tech` after merge.
- [ ] CI green on the PR.

---

## Self-review notes

(Reviewer should verify before invoking executing-plans.)

- Spec § Architecture covered by Tasks 1, 5, 6, 8, 11, 15.
- Spec § Pricing-config admin covered by Tasks 7–10, 18.
- Spec § Clients CRUD covered by Tasks 11–14.
- Spec § Quote builder covered by Tasks 15–17.
- Spec § Audit log covered by Tasks 6, 19.
- Spec § RLS covered by Task 20.
- Spec § Error handling covered by Task 1 + every action task.
- Spec § Testing strategy covered by Tasks 2–4, 6, 8, 10, 12, 16, 21, 22, 24.
- Spec § Acceptance criteria mapped to "Final acceptance checklist" above.
