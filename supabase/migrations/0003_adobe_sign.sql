-- ============================================================================
-- Migration 0003: Replace DocuSeal with Adobe Sign
-- ============================================================================

-- 1. Update the default signature provider on the contracts table
ALTER TABLE dts.contracts 
  ALTER COLUMN signature_provider SET DEFAULT 'adobe_sign';

-- 2. Update any existing rows (if any were created during testing)
UPDATE dts.contracts 
  SET signature_provider = 'adobe_sign' 
  WHERE signature_provider = 'docuseal';

-- 3. Add an audit log entry for the schema change
INSERT INTO dts.audit_log (action, entity_type, diff)
VALUES (
  'schema.migrate',
  'database',
  '{"migration": "0003_adobe_sign", "changes": ["Changed default signature_provider from docuseal to adobe_sign"]}'::jsonb
);
