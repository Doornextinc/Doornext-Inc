-- ============================================================
-- 039: Fix submit_tip to keep order_fee_splits in sync
--
-- The original submit_tip RPC increments orders.driver_payout but
-- never updates order_fee_splits. This causes audit drift: the splits
-- table shows tip_amount = 0 and stale driver_payout even after the
-- customer submits a tip. The fix updates order_fee_splits atomically
-- inside the same statement.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_tip(
  p_order_id    UUID,
  p_customer_id UUID,
  p_tip_amount  NUMERIC
) RETURNS TABLE(order_id UUID, driver_payout NUMERIC, payment_method TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_driver_payout NUMERIC;
BEGIN
  -- Atomic CAS: only succeeds if order is delivered and tip not yet set
  UPDATE orders
  SET
    tip_amount    = p_tip_amount,
    driver_payout = COALESCE(driver_payout, 0) + p_tip_amount,
    updated_at    = NOW()
  WHERE id          = p_order_id
    AND customer_id = p_customer_id
    AND status      = 'delivered'
    AND (tip_amount IS NULL OR tip_amount = 0)
  RETURNING driver_payout INTO v_new_driver_payout;

  -- If nothing was updated the CAS lost — return empty set
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Keep order_fee_splits in sync so audit records reflect the actual tip
  UPDATE order_fee_splits
  SET
    tip_amount    = p_tip_amount,
    driver_payout = v_new_driver_payout
  WHERE order_id = p_order_id;

  -- Return the updated order row
  RETURN QUERY
    SELECT o.id, o.driver_payout, o.payment_method
    FROM   orders o
    WHERE  o.id = p_order_id;
END;
$$;

COMMENT ON FUNCTION submit_tip(UUID, UUID, NUMERIC) IS
  'Atomically record a post-delivery tip on an order and mirror the '
  'change into order_fee_splits. Returns the updated row on success, '
  'empty set if the order is not eligible or tip was already set.';
