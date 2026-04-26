import { z } from "zod";

// ---------------------------------------------------------------------------
// CLIENT
// ---------------------------------------------------------------------------

export const RelationshipTag = z.enum([
  "standard",
  "family",
  "partner",
  "high_touch",
  "priority",
]);

export const ClientInput = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  contact_name: z.string().trim().max(200).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  relationship_tag: RelationshipTag.default("standard"),
});

export type ClientInputT = z.infer<typeof ClientInput>;

// ---------------------------------------------------------------------------
// QUOTE
// ---------------------------------------------------------------------------

export const ProjectType = z.enum(["marketing", "website", "consulting"]);
export const Term = z.enum(["monthly", "six", "twelve"]);

const QuoteScopeSchema = z
  .object({
    setup: z
      .record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          qty: z.number().int().min(1).optional(),
        }),
      )
      .optional(),
    recurring: z
      .record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          qty: z.number().int().min(1).optional(),
        }),
      )
      .optional(),
    oneTime: z
      .record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          qty: z.number().int().min(1).optional(),
        }),
      )
      .optional(),
    website: z
      .record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          qty: z.number().int().min(1).optional(),
        }),
      )
      .optional(),
  })
  .default({});

const QuoteMultipliersSchema = z
  .object({
    rush: z.number().min(0).max(100).optional(),
    highTouch: z.number().min(0).max(100).optional(),
    familyCourtesy: z.number().min(0).max(100).optional(),
  })
  .default({});

const CustomConsultingSchema = z.object({
  hours: z.number().min(0.5).max(2000),
  rateCents: z.number().int().min(5000),
  description: z.string().max(500).optional(),
});

export const QuoteInput = z
  .object({
    client_id: z.string().uuid(),
    project_name: z.string().trim().max(200).optional().or(z.literal("")),
    project_type: ProjectType,
    tier: z.string().trim().max(60).optional().nullable(),
    scope: QuoteScopeSchema,
    multipliers: QuoteMultipliersSchema,
    term: Term.default("monthly"),
    custom_consulting: CustomConsultingSchema.optional().nullable(),
    internal_notes: z.string().max(2000).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.project_type === "marketing" && !v.tier) {
      ctx.addIssue({
        code: "custom",
        path: ["tier"],
        message: "Marketing retainers require a tier",
      });
    }
    if (v.project_type === "consulting" && !v.custom_consulting) {
      ctx.addIssue({
        code: "custom",
        path: ["custom_consulting"],
        message: "Consulting quotes require hours and rate",
      });
    }
  });

export type QuoteInputT = z.infer<typeof QuoteInput>;

// ---------------------------------------------------------------------------
// PRICING CONFIG (loose — full validation is structural and lives in pricing/types.ts)
// ---------------------------------------------------------------------------

export const PricingConfigDraft = z.object({
  version: z.number().int().min(1),
  config: z.record(z.string(), z.unknown()), // accept any JSON; engine will fail loudly if malformed
  publish: z.boolean().default(false),
});

export type PricingConfigDraftT = z.infer<typeof PricingConfigDraft>;
