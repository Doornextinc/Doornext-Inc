-- Migration 006: Admin Platform Extensions
-- Adds: account_status, price_tiers, promo_codes, surge_zones,
--        withdrawals, support_tickets/messages, driver_performance view

-- ============================================================
-- 1. Account status on users
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'approved'
    CHECK (account_status IN ('pending', 'approved', 'suspended', 'banned'));
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users;

-- ============================================================
-- 2. Delivery price tiers
-- ============================================================
CREATE TABLE IF NOT EXISTS price_tiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  description   text,
  base_fee      numeric(8,2) NOT NULL,
  per_km_rate   numeric(8,4) NOT NULL DEFAULT 0,
  min_order_amt numeric(8,2) NOT NULL DEFAULT 0,
  eta_min_mins  int NOT NULL DEFAULT 20,
  eta_max_mins  int NOT NULL DEFAULT 45,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE price_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_price_tiers" ON price_tiers
  FOR SELECT USING (is_active = true);

INSERT INTO price_tiers (name, description, base_fee, per_km_rate, eta_min_mins, eta_max_mins, sort_order) VALUES
  ('Economy',   'Best price, longer wait',     2.49, 0.50, 35, 60, 1),
  ('Standard',  'Balanced price and speed',    3.99, 0.75, 25, 45, 2),
  ('Express',   'Fastest available driver',    6.99, 1.25, 15, 30, 3),
  ('Scheduled', 'Pick a delivery time window', 2.99, 0.60,  0,  0, 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 3. Promo / discount codes
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  description    text,
  discount_type  text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric(8,2) NOT NULL,
  min_order_amt  numeric(8,2) NOT NULL DEFAULT 0,
  max_discount   numeric(8,2),
  usage_limit    int,
  usage_count    int NOT NULL DEFAULT 0,
  per_user_limit int NOT NULL DEFAULT 1,
  starts_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_active_promos" ON promo_codes
  FOR SELECT USING (is_active = true);

-- ============================================================
-- 4. Promo code usage log
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_code_usage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id     uuid NOT NULL REFERENCES promo_codes ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id     uuid REFERENCES orders ON DELETE SET NULL,
  discount_amt numeric(8,2) NOT NULL,
  used_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(promo_id, user_id, order_id)
);

ALTER TABLE promo_code_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_usage_own" ON promo_code_usage
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 5. Surge zones
-- ============================================================
CREATE TABLE IF NOT EXISTS surge_zones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  geojson     jsonb NOT NULL DEFAULT '{}',
  lat_min     numeric(10,6) NOT NULL DEFAULT 0,
  lat_max     numeric(10,6) NOT NULL DEFAULT 0,
  lng_min     numeric(10,6) NOT NULL DEFAULT 0,
  lng_max     numeric(10,6) NOT NULL DEFAULT 0,
  multiplier  numeric(4,2) NOT NULL DEFAULT 1.50,
  reason      text,
  is_active   boolean NOT NULL DEFAULT true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE surge_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_surge_zones" ON surge_zones
  FOR SELECT USING (is_active = true);

-- ============================================================
-- 6. Withdrawals / payouts
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  user_role   text NOT NULL CHECK (user_role IN ('maker', 'driver')),
  amount      numeric(10,2) NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  method      text NOT NULL DEFAULT 'bank_transfer'
              CHECK (method IN ('bank_transfer', 'stripe', 'cash')),
  payout_ref  text,
  notes       text,
  reviewed_by uuid REFERENCES auth.users,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals_own" ON withdrawals
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 7. Support tickets + messages
-- ============================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id    uuid REFERENCES orders ON DELETE SET NULL,
  subject     text NOT NULL,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority    text NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES auth.users,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  message     text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets_own" ON support_tickets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "ticket_messages_read" ON support_messages
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
    OR sender_id = auth.uid()
  );

CREATE POLICY "ticket_messages_insert" ON support_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- ============================================================
-- 8. Extend orders with financial breakdown columns
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS price_tier_id    uuid REFERENCES price_tiers,
  ADD COLUMN IF NOT EXISTS promo_id         uuid REFERENCES promo_codes,
  ADD COLUMN IF NOT EXISTS discount_amt     numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee     numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_payout    numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maker_payout     numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_multiplier numeric(4,2) NOT NULL DEFAULT 1.0;

-- ============================================================
-- 9. Extend settings with new defaults
-- ============================================================
INSERT INTO settings (key, value) VALUES
  ('min_order_amount',     '10.00'),
  ('max_delivery_radius',  '15'),
  ('support_email',        '"support@doornext.com"'),
  ('maintenance_mode',     'false'),
  ('driver_base_payout',   '2.50'),
  ('driver_per_km_payout', '0.50')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 10. Driver performance view
-- ============================================================
CREATE OR REPLACE VIEW driver_performance AS
SELECT
  dp.id,
  dp.full_name,
  dp.vehicle_type,
  dp.is_active,
  dp.kyc_status,
  dp.total_deliveries,
  dp.avg_rating,
  COUNT(CASE
    WHEN o.status = 'delivered'
     AND o.created_at >= now() - interval '7 days'
    THEN 1 END)::int AS deliveries_7d,
  COUNT(CASE
    WHEN o.status = 'delivered'
     AND o.created_at >= now() - interval '30 days'
    THEN 1 END)::int AS deliveries_30d,
  COALESCE(SUM(CASE
    WHEN o.status = 'delivered'
     AND o.created_at >= now() - interval '30 days'
    THEN o.driver_payout END), 0)::numeric AS earnings_30d,
  COUNT(CASE
    WHEN o.status = 'cancelled'
     AND o.nexter_id = dp.id
    THEN 1 END)::int AS cancellations_total,
  dp.created_at
FROM driver_profiles dp
LEFT JOIN orders o ON o.nexter_id = dp.id
GROUP BY dp.id;
