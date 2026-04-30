-- ============================================================
-- 036: Atomic maker withdrawal request
-- ============================================================
-- Mirrors the driver's request_withdrawal_atomic function but
-- uses food_makers + maker_earnings/orders to calculate balance.
-- Uses the same per-user advisory lock pattern to prevent
-- concurrent submissions racing past the pending check.

CREATE OR REPLACE FUNCTION request_maker_withdrawal_atomic(
  p_user_id UUID,
  p_amount  NUMERIC,
  p_method  TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_maker_id  UUID;
  v_earned    NUMERIC;
  v_withdrawn NUMERIC;
  v_available NUMERIC;
  v_pending   UUID;
  v_id        UUID;
BEGIN
  -- Serialize concurrent requests for the same user
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  -- Resolve food_makers row for this user
  SELECT id INTO v_maker_id
  FROM   food_makers
  WHERE  user_id = p_user_id
  LIMIT  1;

  IF v_maker_id IS NULL THEN
    RAISE EXCEPTION 'MAKER_NOT_FOUND';
  END IF;

  -- Reject if a pending withdrawal already exists
  SELECT id INTO v_pending
  FROM   withdrawals
  WHERE  user_id = p_user_id
    AND  status  = 'pending'
  LIMIT  1;

  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'PENDING_EXISTS';
  END IF;

  -- Total earned: maker_earnings is authoritative when present;
  -- fall back to orders.maker_payout for older records without an
  -- earnings row (UNION ALL + NOT EXISTS deduplicates by order).
  SELECT COALESCE(SUM(payout), 0) INTO v_earned
  FROM (
    SELECT me.payout
    FROM   maker_earnings me
    WHERE  me.maker_id = v_maker_id

    UNION ALL

    SELECT o.maker_payout
    FROM   orders o
    WHERE  o.maker_id = v_maker_id
      AND  o.status   = 'delivered'
      AND  NOT EXISTS (
        SELECT 1 FROM maker_earnings me2
        WHERE  me2.order_id = o.id
          AND  me2.maker_id = v_maker_id
      )
  ) AS combined;

  -- Total already withdrawn (pending / approved / paid)
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
  VALUES (p_user_id, 'maker', ROUND(p_amount::NUMERIC, 2), p_method, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
