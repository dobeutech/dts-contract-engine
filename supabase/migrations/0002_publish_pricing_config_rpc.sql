-- ============================================================================
-- Migration 0002: Atomic publish RPC for pricing_config
-- Allows the admin to flip the active pricing config without a window where
-- zero or two configs are active.
-- ============================================================================

CREATE OR REPLACE FUNCTION dts.publish_pricing_config(target_id UUID)
RETURNS dts.pricing_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dts, public
AS $$
DECLARE
  result dts.pricing_config;
BEGIN
  IF auth.role() <> 'authenticated' AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE dts.pricing_config SET is_active = FALSE WHERE is_active = TRUE;
  UPDATE dts.pricing_config SET is_active = TRUE WHERE id = target_id RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pricing_config % not found', target_id;
  END IF;

  INSERT INTO dts.audit_log (actor_id, action, entity_type, entity_id, diff)
  VALUES (auth.uid(), 'pricing_config.publish', 'pricing_config', target_id, jsonb_build_object('version', result.version));

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION dts.publish_pricing_config(UUID) TO authenticated;
