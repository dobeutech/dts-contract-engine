-- Cross-app v5 saga infrastructure — pulled from the shared Supabase project to
-- keep this repo as a source of truth. NOT consumed by the DTS Contract Engine
-- (this app uses dedicated dedup tables in dts.* — see 0004). Lives in public.*
-- because it is shared by other Dobeu apps.
--
-- Applied to remote on 2026-04-21 as version 20260421064453.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_ledger (
  event_key          text PRIMARY KEY,
  source_system      text NOT NULL,
  event_type         text NOT NULL,
  source_object_id   text NOT NULL,
  payload_hash       text NOT NULL,
  payload_pointer_r2 text NOT NULL,
  status             text NOT NULL
    CHECK (status IN ('received','locked','succeeded','failed','dlq','replayed','compensated')),
  attempt_count      int  NOT NULL DEFAULT 0,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL,
  lock_until         timestamptz,
  owner_flow         text,
  result_ref         jsonb,
  error_class        text,
  error_code         text
);

COMMENT ON TABLE  public.event_ledger IS
  'v5 canonical event ledger. One row per external event; saga state + idempotency. Per Appendix J of v5-final-consolidated-plan.md.';

CREATE UNIQUE INDEX IF NOT EXISTS ix_ledger_src_ext
  ON public.event_ledger (source_system, source_object_id, event_type);

CREATE INDEX IF NOT EXISTS ix_ledger_status_lock
  ON public.event_ledger (status, lock_until)
  WHERE status IN ('locked','failed');

CREATE INDEX IF NOT EXISTS ix_ledger_hash
  ON public.event_ledger (payload_hash);

ALTER TABLE public.event_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_ledger_service_only ON public.event_ledger;
CREATE POLICY event_ledger_service_only
  ON public.event_ledger
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.event_ledger FROM anon, authenticated;
GRANT  ALL ON public.event_ledger TO service_role;

CREATE TABLE IF NOT EXISTS public.linear_retry_queue (
  event_key     text        NOT NULL,
  edge          text        NOT NULL,
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  retry_after   timestamptz NOT NULL DEFAULT now(),
  attempt_count int         NOT NULL DEFAULT 0,
  payload       jsonb       NOT NULL,
  PRIMARY KEY (event_key, edge)
);

COMMENT ON TABLE public.linear_retry_queue IS
  'v5 saga-step-5 retry queue. Keyed (event_key, edge). 72h unclaimed -> DLQ via subscenario 4688116.';

CREATE INDEX IF NOT EXISTS ix_retry_ready
  ON public.linear_retry_queue (retry_after)
  WHERE attempt_count < 10;

ALTER TABLE public.linear_retry_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS linear_retry_queue_service_only ON public.linear_retry_queue;
CREATE POLICY linear_retry_queue_service_only
  ON public.linear_retry_queue
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.linear_retry_queue FROM anon, authenticated;
GRANT  ALL ON public.linear_retry_queue TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ledger_upsert_received(
  p_event_key          text,
  p_source_system      text,
  p_event_type         text,
  p_source_object_id   text,
  p_payload_hash       text,
  p_payload_pointer_r2 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.event_ledger%ROWTYPE;
  v_created boolean := false;
BEGIN
  INSERT INTO public.event_ledger (
    event_key, source_system, event_type, source_object_id,
    payload_hash, payload_pointer_r2, status,
    first_seen_at, last_seen_at
  ) VALUES (
    p_event_key, p_source_system, p_event_type, p_source_object_id,
    p_payload_hash, p_payload_pointer_r2, 'received',
    now(), now()
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_created := true;
  ELSE
    UPDATE public.event_ledger
       SET last_seen_at = now()
     WHERE event_key = p_event_key
     RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'created', v_created,
    'row',     to_jsonb(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_ledger_upsert_received IS
  'Worker-side idempotent receipt. Returns {created,row}. First-sight vs dedup-hit distinguished by created flag.';

CREATE OR REPLACE FUNCTION public.fn_ledger_lock_for_processing(
  p_event_key    text,
  p_owner_flow   text,
  p_lock_seconds int DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.event_ledger%ROWTYPE;
  v_acquired boolean := false;
BEGIN
  UPDATE public.event_ledger
     SET status        = 'locked',
         owner_flow    = p_owner_flow,
         lock_until    = now() + make_interval(secs => p_lock_seconds),
         last_seen_at  = now()
   WHERE event_key = p_event_key
     AND (
           status = 'received'
        OR (status = 'failed' AND (lock_until IS NULL OR lock_until <= now()))
        OR (status = 'locked' AND lock_until IS NOT NULL AND lock_until <= now())
     )
   RETURNING * INTO v_row;

  IF FOUND THEN
    v_acquired := true;
  ELSE
    SELECT * INTO v_row FROM public.event_ledger WHERE event_key = p_event_key;
  END IF;

  RETURN jsonb_build_object(
    'acquired', v_acquired,
    'row',      to_jsonb(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_ledger_lock_for_processing IS
  'Conditional lease acquisition. Returns {acquired,row}. Eligible states: received, failed+elapsed, locked+elapsed.';

CREATE OR REPLACE FUNCTION public.fn_ledger_mark_succeeded(
  p_event_key         text,
  p_result_edge_key   text,
  p_result_edge_value jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_ledger
     SET result_ref    = COALESCE(result_ref, '{}'::jsonb)
                      || jsonb_build_object(p_result_edge_key, p_result_edge_value),
         status        = CASE WHEN p_result_edge_key = '_final' THEN 'succeeded' ELSE status END,
         lock_until    = CASE WHEN p_result_edge_key = '_final' THEN NULL       ELSE lock_until END,
         owner_flow    = CASE WHEN p_result_edge_key = '_final' THEN NULL       ELSE owner_flow END,
         error_class   = CASE WHEN p_result_edge_key = '_final' THEN NULL       ELSE error_class END,
         error_code    = CASE WHEN p_result_edge_key = '_final' THEN NULL       ELSE error_code END,
         last_seen_at  = now()
   WHERE event_key = p_event_key;
END;
$$;

COMMENT ON FUNCTION public.fn_ledger_mark_succeeded IS
  'Per-edge success merge into result_ref jsonb. Pass p_result_edge_key=''_final'' to flip status=succeeded.';

CREATE OR REPLACE FUNCTION public.fn_ledger_mark_failed(
  p_event_key            text,
  p_error_class          text,
  p_error_code           text,
  p_retry_after_seconds  int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_ledger
     SET status        = 'failed',
         attempt_count = attempt_count + 1,
         error_class   = p_error_class,
         error_code    = p_error_code,
         lock_until    = CASE
                           WHEN p_retry_after_seconds IS NULL THEN NULL
                           ELSE now() + make_interval(secs => p_retry_after_seconds)
                         END,
         last_seen_at  = now()
   WHERE event_key = p_event_key;
END;
$$;

COMMENT ON FUNCTION public.fn_ledger_mark_failed IS
  'Mark failed + increment attempt_count. lock_until = now() + p_retry_after_seconds acts as retry-after gate.';

CREATE OR REPLACE FUNCTION public.fn_ledger_stale_reclaim(
  p_stale_after_seconds int DEFAULT 300
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reclaimed int;
BEGIN
  UPDATE public.event_ledger
     SET status        = 'received',
         owner_flow    = NULL,
         lock_until    = NULL,
         last_seen_at  = now()
   WHERE status = 'locked'
     AND lock_until IS NOT NULL
     AND lock_until <= now() - make_interval(secs => p_stale_after_seconds);

  GET DIAGNOSTICS v_reclaimed = ROW_COUNT;
  RETURN v_reclaimed;
END;
$$;

COMMENT ON FUNCTION public.fn_ledger_stale_reclaim IS
  'Release locked rows whose lock_until elapsed more than p_stale_after_seconds ago. Returns reclaim count.';

REVOKE ALL ON FUNCTION public.fn_ledger_upsert_received(text,text,text,text,text,text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ledger_lock_for_processing(text,text,int)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ledger_mark_succeeded(text,text,jsonb)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ledger_mark_failed(text,text,text,int)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ledger_stale_reclaim(int)                                    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_ledger_upsert_received(text,text,text,text,text,text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ledger_lock_for_processing(text,text,int)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ledger_mark_succeeded(text,text,jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ledger_mark_failed(text,text,text,int)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ledger_stale_reclaim(int)                                   TO service_role;

COMMIT;
