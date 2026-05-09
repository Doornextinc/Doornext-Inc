-- Migration 060: Atomic pickup PIN attempt RPC.
--
-- Audit finding 2.4 — the previous flow did:
--   1. SELECT order's pin_attempts
--   2. Compare in app code
--   3. UPDATE pin_attempts = old + 1
-- which is a textbook read-modify-write race. Two concurrent failed-PIN
-- requests both observe `pin_attempts = 4`, both write `5`, both bypass the
-- lockout check on the next attempt.
--
-- This RPC collapses everything into a single FOR UPDATE-locked transaction,
-- so check + compare + increment + status flip all happen atomically per row.

CREATE OR REPLACE FUNCTION public.attempt_pickup_pin(
  p_order_id UUID,
  p_pin      TEXT,
  p_maker_id UUID
)
RETURNS TABLE (
  result             TEXT,    -- 'success' | 'wrong_pin' | 'locked' | 'wrong_status' | 'wrong_maker' | 'not_found'
  attempts_remaining INTEGER,
  customer_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  o            RECORD;
  max_attempts INTEGER := 5;
  remaining    INTEGER;
BEGIN
  -- Row-lock the order for the duration of the transaction
  SELECT id, status, maker_id, customer_id, pickup_pin, pin_attempts
    INTO o
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 0, NULL::UUID;
    RETURN;
  END IF;

  IF o.maker_id <> p_maker_id THEN
    RETURN QUERY SELECT 'wrong_maker'::TEXT, 0, o.customer_id;
    RETURN;
  END IF;

  IF o.status <> 'arrived_at_maker' THEN
    RETURN QUERY SELECT 'wrong_status'::TEXT, 0, o.customer_id;
    RETURN;
  END IF;

  IF o.pin_attempts >= max_attempts THEN
    RETURN QUERY SELECT 'locked'::TEXT, 0, o.customer_id;
    RETURN;
  END IF;

  -- Correct PIN → flip status, reset counter
  IF o.pickup_pin = p_pin THEN
    UPDATE public.orders
       SET status       = 'picked_up',
           pin_attempts = 0,
           updated_at   = now()
     WHERE id = p_order_id;
    RETURN QUERY SELECT 'success'::TEXT, max_attempts, o.customer_id;
    RETURN;
  END IF;

  -- Wrong PIN → atomic increment
  UPDATE public.orders
     SET pin_attempts = pin_attempts + 1,
         updated_at   = now()
   WHERE id = p_order_id;

  remaining := max_attempts - (o.pin_attempts + 1);
  IF remaining <= 0 THEN
    RETURN QUERY SELECT 'locked'::TEXT, 0, o.customer_id;
  ELSE
    RETURN QUERY SELECT 'wrong_pin'::TEXT, remaining, o.customer_id;
  END IF;
END;
$$;

-- Lock down execution to authenticated users only (SECURITY DEFINER does the
-- privileged work). Public users have no business calling this directly.
REVOKE ALL ON FUNCTION public.attempt_pickup_pin(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attempt_pickup_pin(UUID, TEXT, UUID) TO authenticated, service_role;
