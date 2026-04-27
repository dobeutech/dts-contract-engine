// Hand-rolled DB row types that mirror the columns of the dts.* tables.
// We intentionally do NOT use generate_typescript_types here because the
// generator needs `dts` exposed in PostgREST-Rest-of-the-world; this lets
// us ship without that dashboard step.
//
// If you change a column, update both the SQL migration and this file.

import type {
  PricingConfig,
  QuoteScope,
  QuoteMultipliers,
  CalcResult,
  CustomConsulting,
  ProjectType,
  Term,
  RelationshipTag,
  QuoteStatus,
} from "../pricing/types";

export interface ClientRow {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  relationship_tag: RelationshipTag;
  apollo_data: Record<string, unknown> | null;
  portal_token: string | null;
  portal_token_expires_at: string | null;
  portal_token_revoked_at: string | null;
  portal_token_last_used_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingConfigRow {
  id: string;
  version: number;
  is_active: boolean;
  config: PricingConfig;
  created_by: string | null;
  created_at: string;
}

export interface QuoteRow {
  id: string;
  client_id: string;
  pricing_config_id: string;
  project_name: string | null;
  project_type: ProjectType;
  tier: string | null;
  scope: QuoteScope;
  multipliers: QuoteMultipliers;
  term: Term;
  custom_consulting: CustomConsulting | null;
  calc: CalcResult | null;
  status: QuoteStatus;
  sent_at: string | null;
  signed_at: string | null;
  contract_pdf_url: string | null;
  internal_notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractRow {
  id: string;
  quote_id: string;
  version: number;
  signed_pdf_url: string | null;
  signature_provider: "adobe_sign" | "docuseal" | string;
  signature_provider_ref: string | null;
  signed_at: string | null;
  signed_by_email: string | null;
  signed_ip: string | null;
  effective_start: string | null;
  effective_end: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  client_id: string;
  contract_id: string | null;
  number: string;
  period_start: string | null;
  period_end: string | null;
  line_items: Array<{ label: string; amount_cents: number; qty?: number }>;
  subtotal_cents: number;
  total_cents: number;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  stripe_invoice_id: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}
