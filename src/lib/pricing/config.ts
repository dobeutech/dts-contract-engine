import type { PricingConfig } from "./types";

// All amounts in integer cents.
// This is the v1 default config; in production the active config
// is loaded from the pricing_config table.

export const DEFAULT_CONFIG: PricingConfig = {
  agency: {
    name: "Dobeu Tech Solutions",
    legalName: "Dobeu Tech Solutions, LLC",
    contactName: "Jeremy Williams, Founder",
    contactEmail: "jeremyw@dobeu.net",
    website: "dobeu.dev",
  },
  projectTypes: {
    marketing: {
      label: "Marketing Retainer",
      description: "Multi-channel digital marketing engagement",
    },
    website: {
      label: "Website / Web App Project",
      description: "Fixed-scope build with deliverables",
    },
    consulting: {
      label: "Consulting / Custom",
      description: "Hourly or scoped advisory work",
    },
  },
  tiers: {
    starter: {
      name: "Starter",
      monthlyRetainerCents: 225_000,
      tagline: "Foundation tier — 2-3 priority markets, single-channel paid",
      sla: {
        strategyCalls: { count: 2, durationMin: 30 },
        emailResponseHrs: 48,
        slackResponse: "Not included",
        consultingHrs: 1,
        revisionRounds: 2,
        reportingCadence: "Monthly email summary",
        qbr: "Add-on",
      },
    },
    growth: {
      name: "Growth",
      monthlyRetainerCents: 350_000,
      tagline: "Recommended — 4-5 markets, multi-platform, automation included",
      sla: {
        strategyCalls: { count: 4, durationMin: 45 },
        emailResponseHrs: 24,
        slackResponse: "Same business day",
        consultingHrs: 3,
        revisionRounds: 3,
        reportingCadence: "Email + 15-min review",
        qbr: "Quarterly, included",
      },
    },
    aggressive: {
      name: "Aggressive",
      monthlyRetainerCents: 550_000,
      tagline:
        "Full coverage — all 7 markets, paid social, enrichment, dedicated channel",
      sla: {
        strategyCalls: { count: 8, durationMin: 60 },
        emailResponseHrs: 12,
        slackResponse: "Within 4 business hours",
        consultingHrs: 6,
        revisionRounds: "Unlimited reasonable",
        reportingCadence: "Live dashboard + monthly review",
        qbr: "Quarterly, executive review",
      },
    },
  },
  setupItems: [
    {
      id: "gsc-ga4-gtm",
      name: "Google Search Console + GA4 + Tag Manager",
      priceCents: 40_000,
      default: true,
      scope:
        "Property verification, sitemap submission, GA4 + GTM container, conversion events",
    },
    {
      id: "google-ads-build",
      name: "Google Ads account build",
      priceCents: 75_000,
      default: true,
      scope:
        "Account creation, conversion tracking, audience seeds, geo-targeting, initial campaign builds",
    },
    {
      id: "meta-suite",
      name: "Meta Business Suite + IG + WhatsApp Business",
      priceCents: 50_000,
      default: true,
      scope:
        "Business Manager, FB Page, IG Business, WhatsApp Business, ad account, pixel install",
    },
    {
      id: "brand-kit",
      name: "Brand consistency kit",
      priceCents: 120_000,
      default: true,
      scope: "Logo lockup variants, color tokens, type scale, voice guide",
    },
    {
      id: "express-templates",
      name: "Adobe Express template library (15-20 templates)",
      priceCents: 60_000,
      default: true,
      scope: "Reusable post templates across formats and platforms",
    },
    {
      id: "seo-audit",
      name: "On-page SEO audit + JobPosting schema",
      priceCents: 70_000,
      default: true,
      scope:
        "Title tags, meta, JobPosting + LocalBusiness schema, robots.txt, sitemap",
    },
    {
      id: "content-calendar",
      name: "Content calendar foundation (30-day plan)",
      priceCents: 40_000,
      default: true,
      scope:
        "Content plan, posting cadence, hashtag strategy, asset library structure",
    },
    {
      id: "landing-page",
      name: "Per-market landing page",
      priceCents: 35_000,
      default: false,
      qty: true,
      scope: "Market-targeted SEO landing page with form integration",
    },
    {
      id: "wa-bot",
      name: "WhatsApp candidate intake bot setup",
      priceCents: 150_000,
      default: false,
      scope:
        "Pre-screening flow, language detection, eligibility capture, Supabase write",
    },
    {
      id: "cio-flows",
      name: "Customer.io drip nurture build",
      priceCents: 90_000,
      default: false,
      scope:
        "Welcome → status → interview prep → 90-day reactivation sequences",
    },
    {
      id: "apollo-pipeline",
      name: "Apollo + Linear B2B triage pipeline",
      priceCents: 120_000,
      default: false,
      scope: "Form → Apollo enrichment → Linear ticket with full payload",
    },
  ],
  recurringAddOns: [
    {
      id: "extra-market",
      name: "Additional market beyond included",
      priceCents: 40_000,
      qty: true,
      unit: "market",
    },
    {
      id: "extra-blog",
      name: "Extra blog / landing page",
      priceCents: 25_000,
      qty: true,
      unit: "ea",
    },
    {
      id: "extra-call",
      name: "Extra strategy call",
      priceCents: 15_000,
      qty: true,
      unit: "ea",
    },
    {
      id: "extra-posts",
      name: "Additional social posts (per 10)",
      priceCents: 10_000,
      qty: true,
      unit: "set",
    },
    {
      id: "wa-mgmt",
      name: "WhatsApp candidate intake management",
      priceCents: 30_000,
    },
    {
      id: "cio-mgmt",
      name: "Customer.io drip nurture management",
      priceCents: 40_000,
    },
    {
      id: "apollo-mgmt",
      name: "Apollo B2B enrichment + Linear triage",
      priceCents: 50_000,
    },
    {
      id: "exec-digest",
      name: "Weekly executive digest (automated)",
      priceCents: 25_000,
    },
    { id: "brand-monitor", name: "Brand drift monitoring", priceCents: 15_000 },
    {
      id: "exec-dashboard",
      name: "Live executive dashboard hosting",
      priceCents: 20_000,
    },
  ],
  oneTimeAddOns: [
    {
      id: "employer-portal",
      name: "Employer / client portal",
      priceCents: 250_000,
    },
    { id: "csv-export", name: "CSV export pipeline", priceCents: 40_000 },
    { id: "sms-alerts", name: "SMS alert system", priceCents: 60_000 },
    {
      id: "indeed-feed",
      name: "Indeed / ZipRecruiter feed integration",
      priceCents: 120_000,
    },
    {
      id: "extra-admin",
      name: "Additional admin role / seat",
      priceCents: 30_000,
    },
    { id: "photo-day", name: "Photo / video shoot day", priceCents: 150_000 },
    {
      id: "custom-integ",
      name: "Custom integration build",
      priceCents: 150_000,
    },
  ],
  websiteTemplates: [
    {
      id: "marketing-site",
      name: "Marketing website (5-7 pages)",
      priceCents: 350_000,
    },
    {
      id: "marketing-site-cms",
      name: "Marketing site + CMS",
      priceCents: 550_000,
    },
    {
      id: "applicant-supabase",
      name: "Applicant intake + Supabase backend + admin dashboard",
      priceCents: 650_000,
    },
    {
      id: "ecommerce-basic",
      name: "Basic e-commerce (Shopify/Webflow)",
      priceCents: 450_000,
    },
    {
      id: "custom-webapp",
      name: "Custom web app (auth + DB + dashboards)",
      priceCents: 1_200_000,
    },
    {
      id: "extra-page",
      name: "Additional page",
      priceCents: 25_000,
      qty: true,
    },
    {
      id: "extra-cms-collection",
      name: "Additional CMS collection",
      priceCents: 40_000,
      qty: true,
    },
    {
      id: "advanced-form",
      name: "Advanced form with file uploads",
      priceCents: 60_000,
      qty: true,
    },
    {
      id: "third-party-integ",
      name: "Third-party integration (Stripe, Mailchimp, etc.)",
      priceCents: 80_000,
      qty: true,
    },
  ],
  multipliers: {
    rush: {
      label: "Rush premium (setup only)",
      default: 0,
      max: 25,
      scope: "setup",
      note: "Apply 15-25% when timeline is compressed",
    },
    highTouch: {
      label: "High-touch buffer (retainer)",
      default: 0,
      max: 30,
      scope: "retainer",
      note: "20% recommended for high-consultation clients — invisible buffer",
    },
    familyCourtesy: {
      label: "Family/relationship courtesy (retainer discount)",
      default: 0,
      max: 25,
      scope: "retainer",
      isDiscount: true,
      note: "Time-limited discount — appears as separate line item on contract",
    },
  },
  termOptions: [
    {
      id: "monthly",
      label: "Month-to-month (30-day notice)",
      discount: 0,
      note: "No commitment, easier sale",
    },
    {
      id: "six",
      label: "6-month commitment",
      discount: 0.1,
      note: "10% retainer discount — recommended",
    },
    {
      id: "twelve",
      label: "12-month commitment",
      discount: 0.15,
      note: "15% retainer discount",
    },
  ],
  overageRates: {
    extraStrategyCallCents: 15_000,
    extraConsultingHourCents: 20_000,
    sameDayResponseCents: 30_000,
    afterHoursMultiplier: 1.5,
    emergencyMultiplier: 2.0,
    onSiteMeetingCents: 50_000,
    extraRevisionRoundCents: 25_000,
  },
  paymentTerms: {
    deposit: 0.5,
    netDays: 0,
    lateFeePctMonth: 1.5,
  },
};
