-- ============================================================
-- 032: Atomic tip submission + atomic withdrawal request
-- ============================================================
-- These functions replace the read-check-then-write patterns in the
-- tip and withdrawal routes, closing the TOCTOU race conditions.

-- ------------------------------------------------------------
-- submit_tip
-- A single conditional UPDATE that serves as both the duplicate
-- check and the update.  Returns the updated row only when the
-- tip was actually accepted (i.e. tip_amount was 0/NULL and the
-- order is delivered and owned by the caller).  An empty result
-- set means the tip was already submitted — the caller should
-- return 409.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_tip(
  p_order_id    UUID,
  p_customer_id UUID,
  p_tip_amount  NUMERIC
) RETURNS TABLE(order_id UUID, driver_payout NUMERIC, payment_method TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET
    tip_amount    = p_tip_amount,
    driver_payout = COALESCE(driver_payout, 0) + p_tip_amount,
    updated_at    = NOW()
  WHERE id          = p_order_id
    AND customer_id = p_customer_id
    AND status      = 'delivered'
    AND (tip_amount IS NULL OR tip_amount = 0)
  RETURNING
    id            AS order_id,
    driver_payout AS driver_payout,
    payment_method;
END;
$$;

-- ------------------------------------------------------------
-- request_withdrawal_atomic
-- Acquires a per-user advisory lock, then checks for an existing
-- pending withdrawal, calculates the available balance, and
-- inserts the new withdrawal record — all inside one transaction.
-- Raises named exceptions on failure:
--   PENDING_EXISTS              – a pending withdrawal already exists
--   INSUFFICIENT_BALANCE:<amt>  – not enough balance (amt = available)
-- Returns the new withdrawal UUID on success.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_withdrawal_atomic(
  p_user_id UUID,
  p_amount  NUMERIC,
  p_method  TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_earned    NUMERIC;
  v_withdrawn NUMERIC;
  v_available NUMERIC;
  v_pending   UUID;
  v_id        UUID;
BEGIN
  -- Serialize concurrent requests for the same user
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  -- Reject if a pending withdrawal already exists
  SELECT id INTO v_pending
  FROM   withdrawals
  WHERE  user_id = p_user_id
    AND  status  = 'pending'
  LIMIT 1;

  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'PENDING_EXISTS';
  END IF;

  -- Total earned from all delivered orders
  SELECT COALESCE(SUM(driver_payout), 0) INTO v_earned
  FROM   orders
  WHERE  nexter_id = p_user_id
    AND  status    = 'delivered';

  -- Total already withdrawn (pending/approved/paid)
  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawn
  FROM   withdrawals
  WHERE  user_id = p_user_id
    AND  status IN ('pending', 'approved', 'paid');

  v_available := ROUND((v_earned - v_withdrawn)::NUMERIC, 2);

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE:%', v_available;
  END IF;

  -- Insert atomically inside the same transaction
  INSERT INTO withdrawals (user_id, user_role, amount, method, status)
  VALUES (p_user_id, 'driver', ROUND(p_amount::NUMERIC, 2), p_method, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
