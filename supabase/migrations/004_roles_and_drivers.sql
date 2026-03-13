-- Migration: Add user roles, driver profiles, settings table, and updated RLS policies
-- Run this against your Supabase project after 002_seed_data.sql

-- ============================================================
-- 1. Role column on users table
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer'
  CHECK (role IN ('customer', 'maker', 'driver', 'admin'));

-- Update existing food maker users to role='maker'
UPDATE users
SET role = 'maker'
WHERE id IN (SELECT user_id FROM food_makers WHERE user_id IS NOT NULL);

-- ============================================================
-- 2. Driver profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name        text NOT NULL,
  avatar_url       text,
  vehicle_type     text CHECK (vehicle_type IN ('car', 'bike', 'foot')),
  is_active        boolean NOT NULL DEFAULT false,
  total_deliveries int NOT NULL DEFAULT 0,
  avg_rating       numeric(3, 2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;

-- Drivers can read/update their own profile
CREATE POLICY "drivers_manage_own_profile" ON driver_profiles
  FOR ALL USING (id = auth.uid());

-- Admins can read all driver profiles (via service role — no RLS policy needed)

-- ============================================================
-- 3. Settings table (for Admin Hub runtime configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Only service role (admin) can read/write settings (no anon/user policies)
-- Seed default settings
INSERT INTO settings (key, value) VALUES
  ('delivery_fee',      '3.99'),
  ('platform_fee_pct',  '0.05'),
  ('service_active',    'true')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. Updated RLS policies on orders for drivers and makers
-- ============================================================

-- Drivers: can SELECT orders assigned to them OR unassigned+ready (to browse available pickups)
CREATE POLICY "drivers_see_orders" ON orders
  FOR SELECT USING (
    nexter_id = auth.uid()
    OR (nexter_id IS NULL AND status = 'ready')
  );

-- Drivers: can UPDATE their own assigned orders (status flow: picked_up → on_the_way → delivered)
CREATE POLICY "drivers_update_own_orders" ON orders
  FOR UPDATE USING (nexter_id = auth.uid());

-- Makers: can SELECT orders for their food_maker
CREATE POLICY "makers_see_orders" ON orders
  FOR SELECT USING (
    maker_id IN (
      SELECT id FROM food_makers WHERE user_id = auth.uid()
    )
  );

-- Makers: can UPDATE orders for their food_maker (status: pending→confirmed→preparing→ready, or cancel)
CREATE POLICY "makers_update_own_orders" ON orders
  FOR UPDATE USING (
    maker_id IN (
      SELECT id FROM food_makers WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. RLS on nexter_locations — drivers update their own row
-- ============================================================
-- Ensure the existing public read policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nexter_locations' AND policyname = 'public_read_nexter_locations'
  ) THEN
    CREATE POLICY "public_read_nexter_locations" ON nexter_locations
      FOR SELECT USING (true);
  END IF;
END$$;

CREATE POLICY "drivers_upsert_own_location" ON nexter_locations
  FOR ALL USING (nexter_id = auth.uid());

-- ============================================================
-- 6. Auto-create driver profile on signup (when role = 'driver')
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_driver()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role = 'driver' THEN
    INSERT INTO driver_profiles (id, full_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.full_name, split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_user_role_driver
  AFTER INSERT OR UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION handle_new_driver();
