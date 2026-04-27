-- ============================================================
-- 033: Admin audit log — append-only enforcement
-- ============================================================
-- Records in admin_audit_log must never be modified or deleted.
-- These triggers raise an exception on any UPDATE or DELETE
-- attempt, ensuring forensic integrity of the audit trail.
-- The SECURITY DEFINER on the function means even the service-
-- role key cannot bypass the constraint.

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION
    'admin_audit_log is append-only — records cannot be modified or deleted (attempted % on row %)',
    TG_OP, OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON admin_audit_log;
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON admin_audit_log;
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- Also add a stripe_refund_id column to orders if not already present,
-- needed for refund idempotency in migration 034+ changes.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

-- Index to quickly detect already-refunded orders
CREATE INDEX IF NOT EXISTS idx_orders_stripe_refund_id
  ON orders (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;
