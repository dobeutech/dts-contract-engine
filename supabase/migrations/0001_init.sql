-- ============================================================================
-- DTS Contract Engine — Initial Schema
-- All objects live in the `dts` schema so this project can share a Supabase
-- project (e.g., the shared "unified-ai" instance) without colliding with
-- other apps' table names.
-- ============================================================================

-- Extensions live in the default schema (`public`) — Supabase convention.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Project-scoped schema
CREATE SCHEMA IF NOT EXISTS dts;

-- Expose the schema to PostgREST/Supabase clients.
-- After this migration: in Supabase Dashboard → Settings → API → "Exposed schemas",
-- add `dts`. The Supabase JS client then needs `.schema('dts')` on every query.
GRANT USAGE ON SCHEMA dts TO authenticated, service_role, anon;
GRANT ALL ON ALL TABLES IN SCHEMA dts TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dts TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dts
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dts
  GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ============================================================================
-- AGENCY (singleton)
-- ============================================================================
CREATE TABLE dts.agency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website TEXT,
  address TEXT,
  logo_url TEXT,
  payment_terms JSONB NOT NULL DEFAULT '{"deposit": 0.5, "net_days": 0, "late_fee_pct_month": 1.5}'::jsonb,
  business_hours JSONB NOT NULL DEFAULT '{"tz": "America/New_York", "start": "09:00", "end": "17:00", "days": [1,2,3,4,5]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PRICING CONFIG (versioned, single active)
-- ============================================================================
CREATE TABLE dts.pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX dts_pricing_config_one_active ON dts.pricing_config (is_active) WHERE is_active = TRUE;

-- ============================================================================
-- CLIENTS
-- ============================================================================
CREATE TABLE dts.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  relationship_tag TEXT NOT NULL DEFAULT 'standard'
    CHECK (relationship_tag IN ('standard', 'family', 'partner', 'high_touch', 'priority')),
  apollo_data JSONB,
  portal_token TEXT UNIQUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dts_clients_email_idx ON dts.clients (email) WHERE deleted_at IS NULL;
CREATE INDEX dts_clients_relationship_idx ON dts.clients (relationship_tag);

-- ============================================================================
-- QUOTES (the working draft)
-- ============================================================================
CREATE TABLE dts.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES dts.clients(id) ON DELETE CASCADE,
  pricing_config_id UUID NOT NULL REFERENCES dts.pricing_config(id),
  project_name TEXT,
  project_type TEXT NOT NULL CHECK (project_type IN ('marketing', 'website', 'consulting')),
  tier TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  multipliers JSONB NOT NULL DEFAULT '{}'::jsonb,
  term TEXT NOT NULL DEFAULT 'monthly',
  custom_consulting JSONB,
  calc JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'active', 'closed', 'lost', 'void')),
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  contract_pdf_url TEXT,
  internal_notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dts_quotes_client_idx ON dts.quotes (client_id) WHERE deleted_at IS NULL;
CREATE INDEX dts_quotes_status_idx ON dts.quotes (status) WHERE deleted_at IS NULL;

-- ============================================================================
-- CONTRACTS (signed instances — immutable)
-- ============================================================================
CREATE TABLE dts.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES dts.quotes(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1,
  signed_pdf_url TEXT,
  signature_provider TEXT NOT NULL DEFAULT 'docuseal',
  signature_provider_ref TEXT,
  signed_at TIMESTAMPTZ,
  signed_by_email TEXT,
  signed_ip TEXT,
  effective_start DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dts_contracts_quote_idx ON dts.contracts (quote_id);
CREATE INDEX dts_contracts_active_idx ON dts.contracts (effective_start, effective_end);

-- ============================================================================
-- CONSULTING LOG (the killer feature — every billable minute)
-- ============================================================================
CREATE TABLE dts.consulting_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES dts.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES dts.contracts(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'message', 'meeting', 'research', 'other')),
  notes TEXT,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  waived BOOLEAN NOT NULL DEFAULT FALSE,
  waived_reason TEXT,
  invoice_id UUID,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'calendar', 'webhook', 'api')),
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dts_consulting_log_client_period_idx ON dts.consulting_log (client_id, occurred_at);
CREATE INDEX dts_consulting_log_unbilled_idx ON dts.consulting_log (client_id) WHERE invoice_id IS NULL AND billable = TRUE AND waived = FALSE;

-- ============================================================================
-- INVOICES
-- ============================================================================
CREATE TABLE dts.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES dts.clients(id),
  contract_id UUID REFERENCES dts.contracts(id),
  number TEXT UNIQUE NOT NULL,
  period_start DATE,
  period_end DATE,
  line_items JSONB NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void')),
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  stripe_invoice_id TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dts_invoices_client_idx ON dts.invoices (client_id);
CREATE INDEX dts_invoices_status_idx ON dts.invoices (status);

-- ============================================================================
-- AUDIT LOG (immutable)
-- ============================================================================
CREATE TABLE dts.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  diff JSONB,
  ip TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dts_audit_log_entity_idx ON dts.audit_log (entity_type, entity_id);
CREATE INDEX dts_audit_log_actor_idx ON dts.audit_log (actor_id, occurred_at DESC);

-- ============================================================================
-- TRIGGERS — updated_at maintenance (function lives in dts schema)
-- ============================================================================
CREATE OR REPLACE FUNCTION dts.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agency_settings_updated_at BEFORE UPDATE ON dts.agency_settings FOR EACH ROW EXECUTE FUNCTION dts.set_updated_at();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON dts.clients FOR EACH ROW EXECUTE FUNCTION dts.set_updated_at();
CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON dts.quotes FOR EACH ROW EXECUTE FUNCTION dts.set_updated_at();
CREATE TRIGGER consulting_log_updated_at BEFORE UPDATE ON dts.consulting_log FOR EACH ROW EXECUTE FUNCTION dts.set_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON dts.invoices FOR EACH ROW EXECUTE FUNCTION dts.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY — single-owner mode (v1)
-- ============================================================================
ALTER TABLE dts.agency_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.consulting_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE dts.audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users (the agency owner) have full access.
-- Client portal access goes through service_role with token validation in app.

CREATE POLICY "owner_all" ON dts.agency_settings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_all" ON dts.pricing_config FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_all" ON dts.clients FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_all" ON dts.quotes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_all" ON dts.contracts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_all" ON dts.consulting_log FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_all" ON dts.invoices FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "owner_read" ON dts.audit_log FOR SELECT USING (auth.role() = 'authenticated');
-- audit_log writes only via service_role (server-side)
