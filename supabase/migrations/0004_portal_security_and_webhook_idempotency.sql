-- 0004 — Production-readiness security + idempotency hardening
--
-- 1) Portal token expiry + revocation columns on dts.clients.
--    Capability URLs that never expire are a long-tail leak risk; rotation
--    overwrites the token but does not retroactively invalidate every prior
--    appearance in browser history, screenshares, mail-server logs, etc.
--
-- 2) Webhook event-id dedup tables for Adobe Sign and Stripe.
--    Both providers retry deliveries; without dedup we re-run side effects
--    (PDF download, kickoff email, audit row) on every retry.
--
-- 3) Private "contracts" storage bucket.
--    Signed PDFs must NOT be served via getPublicUrl. App code now uses
--    createSignedUrl(path, ttl) with a token-gated server action. This
--    migration also enforces "service-role only" RLS on storage.objects
--    for that bucket so the anon key cannot list or read.

BEGIN;

-- 1. Portal token expiry / revocation -----------------------------------------

ALTER TABLE dts.clients
  ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_token_last_used_at TIMESTAMPTZ;

COMMENT ON COLUMN dts.clients.portal_token_expires_at IS
  'Capability URL expiry. Server rejects portal requests after this. Default 90 days set by app on rotation.';
COMMENT ON COLUMN dts.clients.portal_token_revoked_at IS
  'Manual revocation timestamp. Honored independently of expiry for incident response.';
COMMENT ON COLUMN dts.clients.portal_token_last_used_at IS
  'Last successful portal request. Used by app to surface stale tokens for proactive rotation.';

-- Backfill: existing tokens get a 90-day forward expiry so we don't break
-- any in-flight links the second this ships. Future rotations will set the
-- value explicitly via the rotateAction.
UPDATE dts.clients
   SET portal_token_expires_at = now() + INTERVAL '90 days'
 WHERE portal_token IS NOT NULL
   AND portal_token_expires_at IS NULL;

-- 2. Webhook idempotency tables ----------------------------------------------

CREATE TABLE IF NOT EXISTS dts.adobe_sign_events (
  event_key       text PRIMARY KEY,           -- agreement_id::event_type::occurred_at
  agreement_id    text NOT NULL,
  event_type      text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

COMMENT ON TABLE dts.adobe_sign_events IS
  'Adobe Sign webhook idempotency log. INSERT ... ON CONFLICT DO NOTHING on receipt; only run side effects when the row is new.';

CREATE INDEX IF NOT EXISTS ix_adobe_sign_events_agreement
  ON dts.adobe_sign_events (agreement_id);

ALTER TABLE dts.adobe_sign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adobe_sign_events_service_only ON dts.adobe_sign_events;
CREATE POLICY adobe_sign_events_service_only
  ON dts.adobe_sign_events
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON dts.adobe_sign_events FROM anon, authenticated;
GRANT  ALL ON dts.adobe_sign_events TO service_role;

CREATE TABLE IF NOT EXISTS dts.stripe_events (
  event_id        text PRIMARY KEY,
  event_type      text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

COMMENT ON TABLE dts.stripe_events IS
  'Stripe webhook idempotency log. INSERT ... ON CONFLICT DO NOTHING on event.id; only run side effects when the row is new.';

ALTER TABLE dts.stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_events_service_only ON dts.stripe_events;
CREATE POLICY stripe_events_service_only
  ON dts.stripe_events
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON dts.stripe_events FROM anon, authenticated;
GRANT  ALL ON dts.stripe_events TO service_role;

-- 3. Private contracts bucket -------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage RLS: service role only. App code creates signed URLs.
DROP POLICY IF EXISTS contracts_service_only_select ON storage.objects;
CREATE POLICY contracts_service_only_select
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'contracts' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS contracts_service_only_insert ON storage.objects;
CREATE POLICY contracts_service_only_insert
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS contracts_service_only_update ON storage.objects;
CREATE POLICY contracts_service_only_update
  ON storage.objects
  FOR UPDATE
  USING      (bucket_id = 'contracts' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS contracts_service_only_delete ON storage.objects;
CREATE POLICY contracts_service_only_delete
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'contracts' AND auth.role() = 'service_role');

COMMIT;
