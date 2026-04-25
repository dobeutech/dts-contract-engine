// Strict type definitions for the pricing engine.
// These are the shapes Copilot should target throughout the app.

export type ProjectType = "marketing" | "website" | "consulting";
export type Term = "monthly" | "six" | "twelve";
export type RelationshipTag =
  | "standard"
  | "family"
  | "partner"
  | "high_touch"
  | "priority";
export type QuoteStatus =
  | "draft"
  | "sent"
  | "signed"
  | "active"
  | "closed"
  | "lost"
  | "void";

export interface SLATerms {
  strategyCalls: { count: number; durationMin: number };
  emailResponseHrs: number;
  slackResponse: string;
  consultingHrs: number;
  revisionRounds: number | string;
  reportingCadence: string;
  qbr: string;
}

export interface Tier {
  name: string;
  monthlyRetainerCents: number;
  tagline: string;
  sla: SLATerms;
}

export interface LineItem {
  id: string;
  name: string;
  priceCents: number;
  scope?: string;
  default?: boolean;
  qty?: boolean;
  unit?: string;
}

export interface Multiplier {
  label: string;
  default: number;
  max: number;
  scope: "setup" | "retainer";
  isDiscount?: boolean;
  note: string;
}

export interface TermOption {
  id: Term;
  label: string;
  discount: number;
  note: string;
}

export interface OverageRates {
  extraStrategyCallCents: number;
  extraConsultingHourCents: number;
  sameDayResponseCents: number;
  afterHoursMultiplier: number;
  emergencyMultiplier: number;
  onSiteMeetingCents: number;
  extraRevisionRoundCents: number;
}

export interface PricingConfig {
  agency: {
    name: string;
    legalName: string;
    contactName: string;
    contactEmail: string;
    website: string;
    address?: string;
  };
  projectTypes: Record<ProjectType, { label: string; description: string }>;
  tiers: Record<string, Tier>;
  setupItems: LineItem[];
  recurringAddOns: LineItem[];
  oneTimeAddOns: LineItem[];
  websiteTemplates: LineItem[];
  multipliers: {
    rush: Multiplier;
    highTouch: Multiplier;
    familyCourtesy: Multiplier;
  };
  termOptions: TermOption[];
  overageRates: OverageRates;
  paymentTerms: {
    deposit: number;
    netDays: number;
    lateFeePctMonth: number;
  };
}

export interface QuoteScope {
  setup?: Record<string, { enabled: boolean; qty?: number }>;
  recurring?: Record<string, { enabled: boolean; qty?: number }>;
  oneTime?: Record<string, { enabled: boolean; qty?: number }>;
  website?: Record<string, { enabled: boolean; qty?: number }>;
}

export interface QuoteMultipliers {
  rush?: number;
  highTouch?: number;
  familyCourtesy?: number;
}

export interface CustomConsulting {
  hours: number;
  rateCents: number;
  description?: string;
}

export interface QuoteInput {
  projectType: ProjectType;
  tier?: string;
  scope?: QuoteScope;
  multipliers?: QuoteMultipliers;
  term?: Term;
  customConsulting?: CustomConsulting;
}

export interface CalcResult {
  // All amounts in integer cents
  setupBaseCents: number;
  recurringBaseCents: number;
  oneTimeBaseCents: number;
  tierBaseCents: number;
  websiteBaseCents: number;
  consultingBaseCents: number;
  baseMonthlyCents: number;
  setupTotalCents: number;
  retainerWithBufferCents: number;
  retainerAfterTermDiscountCents: number;
  retainerAfterFamilyCents: number;
  familyDiscountAmountCents: number;
  termDiscountAmountCents: number;
  monthlyTotalCents: number;
  firstMonthTotalCents: number;
  year1TotalCents: number;
  depositAmountCents: number;
  // Multiplier values applied (for display)
  rushPct: number;
  highTouchPct: number;
  familyPct: number;
  termDiscountPct: number;
}
