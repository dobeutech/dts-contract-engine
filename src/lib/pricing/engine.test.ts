import { describe, it, expect } from "vitest";
import { calculate } from "./engine";
import { DEFAULT_CONFIG } from "./config";

describe("pricing engine", () => {
  it("zero quote returns all zeros", () => {
    const r = calculate({ projectType: "marketing" }, DEFAULT_CONFIG);
    expect(r.setupTotalCents).toBe(0);
    expect(r.monthlyTotalCents).toBe(0);
  });

  it("Growth tier baseline = $3,500/mo", () => {
    const r = calculate(
      { projectType: "marketing", tier: "growth" },
      DEFAULT_CONFIG,
    );
    expect(r.tierBaseCents).toBe(350_000);
    expect(r.monthlyTotalCents).toBe(350_000);
  });

  it("high-touch buffer 20% inflates retainer silently", () => {
    const r = calculate(
      {
        projectType: "marketing",
        tier: "growth",
        multipliers: { highTouch: 20 },
      },
      DEFAULT_CONFIG,
    );
    expect(r.retainerWithBufferCents).toBe(420_000); // 350k × 1.2
    expect(r.monthlyTotalCents).toBe(420_000);
  });

  it("rush premium applies to setup only, not retainer", () => {
    const r = calculate(
      {
        projectType: "marketing",
        tier: "growth",
        scope: { setup: { "gsc-ga4-gtm": { enabled: true } } },
        multipliers: { rush: 20 },
      },
      DEFAULT_CONFIG,
    );
    expect(r.setupTotalCents).toBe(48_000); // 40k × 1.2
    expect(r.monthlyTotalCents).toBe(350_000); // unaffected
  });

  it("order of operations: highTouch → termDiscount → familyCourtesy", () => {
    const r = calculate(
      {
        projectType: "marketing",
        tier: "growth",
        term: "six",
        multipliers: { highTouch: 20, familyCourtesy: 10 },
      },
      DEFAULT_CONFIG,
    );
    // 350k × 1.2 = 420k
    // 420k × 0.9 (10% term discount) = 378k
    // 378k × 0.9 (10% family) = 340.2k → 340_200
    expect(r.retainerWithBufferCents).toBe(420_000);
    expect(r.retainerAfterTermDiscountCents).toBe(378_000);
    expect(r.monthlyTotalCents).toBe(340_200);
  });

  it("first-month invoice = setup + monthly + one-time", () => {
    const r = calculate(
      {
        projectType: "marketing",
        tier: "starter",
        scope: {
          setup: { "gsc-ga4-gtm": { enabled: true } }, // 40k
          oneTime: { "sms-alerts": { enabled: true } }, // 60k
        },
      },
      DEFAULT_CONFIG,
    );
    expect(r.firstMonthTotalCents).toBe(40_000 + 225_000 + 60_000); // 325k
  });

  it("quantities multiply line items correctly", () => {
    const r = calculate(
      {
        projectType: "marketing",
        tier: "growth",
        scope: {
          setup: { "landing-page": { enabled: true, qty: 3 } }, // 35k × 3 = 105k
        },
      },
      DEFAULT_CONFIG,
    );
    expect(r.setupBaseCents).toBe(105_000);
  });
});
