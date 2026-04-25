import type { PricingConfig, QuoteInput, CalcResult } from "./types";

/**
 * Pure pricing engine. No I/O. Deterministic.
 *
 * ORDER OF OPERATIONS (do NOT change without updating tests):
 * 1. Sum all base components (setup, recurring, one-time, website, consulting)
 * 2. Apply rush premium to setup-side total ONLY
 * 3. Compute monthly base = tier + recurring
 * 4. Apply high-touch buffer (silent retainer inflation)
 * 5. Apply term commitment discount
 * 6. Apply family courtesy discount (visible line item)
 * 7. Compute first-month invoice & year-1 projection
 *
 * All amounts in integer cents.
 */
export function calculate(
  input: QuoteInput,
  config: PricingConfig,
): CalcResult {
  const {
    projectType,
    tier,
    scope = {},
    multipliers = {},
    term = "monthly",
    customConsulting,
  } = input;

  const sumLineItems = (
    items: typeof config.setupItems,
    sel?: Record<string, { enabled: boolean; qty?: number }>,
  ) => {
    if (!sel) return 0;
    return items.reduce((sum, it) => {
      const s = sel[it.id];
      if (!s?.enabled) return sum;
      return sum + it.priceCents * (s.qty ?? 1);
    }, 0);
  };

  const setupBaseCents = sumLineItems(config.setupItems, scope.setup);
  const recurringBaseCents = sumLineItems(
    config.recurringAddOns,
    scope.recurring,
  );
  const oneTimeBaseCents = sumLineItems(config.oneTimeAddOns, scope.oneTime);
  const websiteBaseCents =
    projectType === "website"
      ? sumLineItems(config.websiteTemplates, scope.website)
      : 0;

  const consultingBaseCents =
    projectType === "consulting" && customConsulting
      ? Math.round(customConsulting.hours * customConsulting.rateCents)
      : 0;

  const tierBaseCents =
    projectType === "marketing" && tier
      ? (config.tiers[tier]?.monthlyRetainerCents ?? 0)
      : 0;

  const baseMonthlyCents = tierBaseCents + recurringBaseCents;

  const rushPct = (multipliers.rush ?? 0) / 100;
  const highTouchPct = (multipliers.highTouch ?? 0) / 100;
  const familyPct = (multipliers.familyCourtesy ?? 0) / 100;
  const termOpt = config.termOptions.find((t) => t.id === term);
  const termDiscountPct = termOpt?.discount ?? 0;

  // Setup-side: apply rush premium
  const setupAndProjectBase =
    setupBaseCents + websiteBaseCents + consultingBaseCents;
  const setupTotalCents = Math.round(setupAndProjectBase * (1 + rushPct));

  // Retainer-side: high-touch buffer → term discount → family courtesy
  const retainerWithBufferCents = Math.round(
    baseMonthlyCents * (1 + highTouchPct),
  );
  const termDiscountAmountCents = Math.round(
    retainerWithBufferCents * termDiscountPct,
  );
  const retainerAfterTermDiscountCents =
    retainerWithBufferCents - termDiscountAmountCents;
  const familyDiscountAmountCents = Math.round(
    retainerAfterTermDiscountCents * familyPct,
  );
  const retainerAfterFamilyCents =
    retainerAfterTermDiscountCents - familyDiscountAmountCents;

  const monthlyTotalCents = retainerAfterFamilyCents;
  const firstMonthTotalCents =
    setupTotalCents + monthlyTotalCents + oneTimeBaseCents;
  const year1TotalCents =
    setupTotalCents + monthlyTotalCents * 12 + oneTimeBaseCents;

  const depositAmountCents = Math.round(
    setupTotalCents * config.paymentTerms.deposit,
  );

  return {
    setupBaseCents,
    recurringBaseCents,
    oneTimeBaseCents,
    tierBaseCents,
    websiteBaseCents,
    consultingBaseCents,
    baseMonthlyCents,
    setupTotalCents,
    retainerWithBufferCents,
    retainerAfterTermDiscountCents,
    retainerAfterFamilyCents,
    familyDiscountAmountCents,
    termDiscountAmountCents,
    monthlyTotalCents,
    firstMonthTotalCents,
    year1TotalCents,
    depositAmountCents,
    rushPct,
    highTouchPct,
    familyPct,
    termDiscountPct,
  };
}

export const formatCents = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
