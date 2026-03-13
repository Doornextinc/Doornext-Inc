-- ─── Distance-based delivery tiers ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_distance_tiers (
  id               serial PRIMARY KEY,
  distance_min     numeric(8,2) NOT NULL,     -- miles (inclusive)
  distance_max     numeric(8,2),              -- miles (exclusive), NULL = unlimited
  customer_fee     numeric(8,2) NOT NULL,
  driver_base_pay  numeric(8,2) NOT NULL,
  label            text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int  NOT NULL DEFAULT 0
);

INSERT INTO delivery_distance_tiers
  (distance_min, distance_max, customer_fee, driver_base_pay, label, sort_order)
VALUES
  ( 0,  2,  2.99, 3.00, '0–2 miles',  1),
  ( 2,  5,  4.49, 4.00, '2–5 miles',  2),
  ( 5,  8,  6.49, 5.50, '5–8 miles',  3),
  ( 8, 12,  8.99, 7.50, '8–12 miles', 4);

-- ─── Priority delivery tiers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS priority_delivery_tiers (
  id                    serial PRIMARY KEY,
  distance_min          numeric(8,2) NOT NULL,
  distance_max          numeric(8,2),
  customer_fee          numeric(8,2) NOT NULL,
  driver_priority_bonus numeric(8,2) NOT NULL DEFAULT 2.50,
  label                 text NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            int  NOT NULL DEFAULT 0
);

INSERT INTO priority_delivery_tiers
  (distance_min, distance_max, customer_fee, driver_priority_bonus, label, sort_order)
VALUES
  ( 0,  5,  6.99, 2.50, '0–5 miles',  1),
  ( 5, 10,  9.99, 2.50, '5–10 miles', 2),
  (10, NULL, 12.99, 2.50, '10+ miles', 3);

-- ─── Small order fees ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS small_order_fees (
  id               serial PRIMARY KEY,
  order_value_min  numeric(8,2) NOT NULL DEFAULT 0,
  order_value_max  numeric(8,2),             -- NULL = no upper cap
  fee              numeric(8,2) NOT NULL,
  label            text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int  NOT NULL DEFAULT 0
);

INSERT INTO small_order_fees
  (order_value_min, order_value_max, fee, label, sort_order)
VALUES
  ( 0,  10, 2.00, 'Under $10', 1),
  (10,  15, 1.00, '$10–$15',   2),
  (15, NULL, 0.00, '$15+',     3);

-- ─── Surge conditions (platform-wide, distinct from geo surge_zones) ──────────
CREATE TABLE IF NOT EXISTS surge_conditions (
  id               serial PRIMARY KEY,
  condition_type   text NOT NULL UNIQUE,
  label            text NOT NULL,
  description      text,
  extra_fee        numeric(8,2) NOT NULL,
  driver_share_pct numeric(5,2) NOT NULL DEFAULT 85,
  is_active        boolean NOT NULL DEFAULT false,
  activated_at     timestamptz,
  activated_by     uuid REFERENCES auth.users ON DELETE SET NULL
);

INSERT INTO surge_conditions
  (condition_type, label, description, extra_fee, driver_share_pct)
VALUES
  ('high_demand', 'High Demand',  'Higher than normal order volume',     1.50, 85),
  ('very_busy',   'Very Busy',    'Extremely high demand, few drivers',  3.00, 85),
  ('storm_snow',  'Storm / Snow', 'Severe weather conditions',           4.00, 90);

-- ─── Driver missions (admin creates, driver sees) ─────────────────────────────
CREATE TABLE IF NOT EXISTS driver_missions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  icon            text NOT NULL DEFAULT '🎯',
  mission_type    text NOT NULL
                  CHECK (mission_type IN ('deliveries', 'ratings', 'hours', 'distance', 'custom')),
  target_value    int  NOT NULL,           -- e.g. 5 deliveries, 3 ratings
  reward_amount   numeric(8,2) NOT NULL,
  period          text NOT NULL DEFAULT 'daily'
                  CHECK (period IN ('daily', 'weekly', 'monthly', 'one_time')),
  is_active       boolean NOT NULL DEFAULT false,
  is_preset       boolean NOT NULL DEFAULT false,  -- preset templates shown to admin
  created_by      uuid REFERENCES auth.users ON DELETE SET NULL,
  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Preset mission templates (admin picks from these)
INSERT INTO driver_missions
  (title, description, icon, mission_type, target_value, reward_amount, period, is_preset, is_active)
VALUES
  ('Complete 5 deliveries',           'Finish 5 successful deliveries today',           '🎯', 'deliveries', 5,  5.00, 'daily',   true, false),
  ('Complete 10 deliveries',          'Power through 10 deliveries in a day',           '🔥', 'deliveries', 10, 12.00, 'daily',  true, false),
  ('Rush-hour dash (4–8 PM)',          'Complete 3 deliveries during peak hours',        '⚡', 'deliveries', 3,  3.00, 'daily',   true, false),
  ('Earn 3 five-star ratings',         'Receive 3 five-star ratings this week',          '⭐', 'ratings',    3,  2.00, 'weekly',  true, false),
  ('Complete 30 deliveries this week', 'High-volume weekly challenge',                  '📦', 'deliveries', 30, 20.00, 'weekly', true, false),
  ('Deliver to 3 zip codes',           'Expand your delivery range today',              '🗺️',  'distance',   3,  4.00, 'daily',   true, false),
  ('Morning dash (7–11 AM)',           'Complete 3 deliveries during morning hours',    '☀️',  'deliveries', 3,  3.50, 'daily',   true, false),
  ('Weekend warrior',                  'Complete 15 deliveries over the weekend',       '🏆', 'deliveries', 15, 15.00, 'weekly', true, false),
  ('Perfect week',                     'Maintain a 4.8+ rating for 7 straight days',   '💎', 'ratings',    7,  10.00, 'weekly', true, false),
  ('New driver bonus',                 'Complete your first 5 deliveries',              '🚀', 'deliveries', 5,  8.00, 'one_time', true, false);

-- ─── Pricing formula settings (stored in existing settings table) ─────────────
INSERT INTO settings (key, value) VALUES
  ('dynamic_base_pay',     '2.50'),
  ('dynamic_per_mile',     '0.80'),
  ('dynamic_per_min_wait', '0.30'),
  ('use_dynamic_pricing',  'false'),
  ('priority_driver_bonus','2.50'),
  ('service_fee_pct',      '9')
ON CONFLICT (key) DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE delivery_distance_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read delivery_distance_tiers" ON delivery_distance_tiers FOR SELECT USING (true);
CREATE POLICY "admin write delivery_distance_tiers" ON delivery_distance_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE priority_delivery_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read priority_delivery_tiers" ON priority_delivery_tiers FOR SELECT USING (true);
CREATE POLICY "admin write priority_delivery_tiers" ON priority_delivery_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE small_order_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read small_order_fees" ON small_order_fees FOR SELECT USING (true);
CREATE POLICY "admin write small_order_fees" ON small_order_fees FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE surge_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read surge_conditions" ON surge_conditions FOR SELECT USING (true);
CREATE POLICY "admin write surge_conditions" ON surge_conditions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE driver_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver read active missions" ON driver_missions FOR SELECT USING (is_active = true OR is_preset = true);
CREATE POLICY "admin all missions" ON driver_missions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
