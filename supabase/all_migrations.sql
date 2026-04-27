-- Enable uuid generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS (customer profiles)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  full_name text not null default '',
  avatar_url text,
  default_address_id uuid,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view their own profile"
  on public.users for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.users for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.users for insert with check (auth.uid() = id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ADDRESSES
-- ============================================================
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null default 'Home',
  street text not null,
  city text not null,
  state text not null,
  zip text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.addresses enable row level security;

create policy "Users manage their own addresses"
  on public.addresses for all using (auth.uid() = user_id);

-- ============================================================
-- FOOD MAKERS
-- ============================================================
create table public.food_makers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  bio text,
  avatar_url text,
  banner_url text,
  cuisine_tags text[] not null default '{}',
  avg_rating numeric(3,2) not null default 0,
  total_reviews int not null default 0,
  is_open boolean not null default false,
  service_radius_km numeric(5,2) not null default 5,
  lat double precision not null,
  lng double precision not null,
  prep_time_mins int not null default 30,
  created_at timestamptz not null default now()
);

alter table public.food_makers enable row level security;

create policy "Anyone can view food makers"
  on public.food_makers for select using (true);

-- ============================================================
-- MENU ITEMS
-- ============================================================
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.food_makers(id) on delete cascade,
  name text not null,
  description text,
  price numeric(8,2) not null,
  photo_url text,
  dietary_tags text[] not null default '{}',
  is_available boolean not null default true,
  daily_limit int,
  prep_time_mins int not null default 30,
  category text,
  created_at timestamptz not null default now()
);

alter table public.menu_items enable row level security;

create policy "Anyone can view menu items"
  on public.menu_items for select using (true);

-- ============================================================
-- ORDERS
-- ============================================================
create type order_status as enum (
  'pending', 'confirmed', 'preparing', 'ready',
  'picked_up', 'on_the_way', 'delivered', 'cancelled'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id),
  maker_id uuid not null references public.food_makers(id),
  nexter_id uuid references public.users(id),
  status order_status not null default 'pending',
  subtotal numeric(8,2) not null,
  delivery_fee numeric(8,2) not null default 3.99,
  tip_amount numeric(8,2) not null default 0,
  platform_fee numeric(8,2) not null default 0,
  total numeric(8,2) not null,
  delivery_address jsonb not null,
  stripe_payment_intent_id text,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Customers view their own orders"
  on public.orders for select using (auth.uid() = customer_id);

create policy "Customers create orders"
  on public.orders for insert with check (auth.uid() = customer_id);

-- Enable realtime for order status updates
alter publication supabase_realtime add table public.orders;

-- ============================================================
-- ORDER ITEMS
-- ============================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  quantity int not null default 1,
  unit_price numeric(8,2) not null,
  customization_notes text
);

alter table public.order_items enable row level security;

create policy "Users view their order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
      and orders.customer_id = auth.uid()
    )
  );

-- ============================================================
-- REVIEWS
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  customer_id uuid not null references public.users(id),
  maker_id uuid not null references public.food_makers(id),
  rating int not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Anyone can view reviews"
  on public.reviews for select using (true);

create policy "Customers create reviews"
  on public.reviews for insert with check (auth.uid() = customer_id);

-- Auto-update maker avg_rating on review insert
create or replace function public.update_maker_rating()
returns trigger language plpgsql security definer as $$
begin
  update public.food_makers
  set
    avg_rating = (
      select avg(rating)::numeric(3,2)
      from public.reviews
      where maker_id = new.maker_id
    ),
    total_reviews = (
      select count(*) from public.reviews where maker_id = new.maker_id
    )
  where id = new.maker_id;
  return new;
end;
$$;

create trigger on_review_created
  after insert on public.reviews
  for each row execute procedure public.update_maker_rating();

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Users view their notifications"
  on public.notifications for all using (auth.uid() = user_id);

-- Enable realtime for notifications
alter publication supabase_realtime add table public.notifications;

-- ============================================================
-- NEXTER LOCATIONS (realtime tracking)
-- ============================================================
create table public.nexter_locations (
  nexter_id uuid primary key references public.users(id),
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.nexter_locations enable row level security;

create policy "Anyone can view nexter locations"
  on public.nexter_locations for select using (true);

-- Enable realtime for live tracking
alter publication supabase_realtime add table public.nexter_locations;

-- ============================================================
-- FAVORITES
-- ============================================================
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  maker_id uuid references public.food_makers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, maker_id)
);

alter table public.favorites enable row level security;

create policy "Users manage their favorites"
  on public.favorites for all using (auth.uid() = user_id);

-- ============================================================
-- PUSH TOKENS
-- ============================================================
create table public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null, -- 'ios' | 'android' | 'web'
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.user_push_tokens enable row level security;

create policy "Users manage their push tokens"
  on public.user_push_tokens for all using (auth.uid() = user_id);
-- Seed: Sample Food Makers + Menu Items
-- Run this in the Supabase SQL Editor after the initial migration

-- Insert food makers
INSERT INTO public.food_makers
  (display_name, bio, cuisine_tags, avg_rating, total_reviews, is_open, service_radius_km, lat, lng, prep_time_mins)
VALUES
  (
    'Mama Adaeze''s Kitchen',
    'Authentic Nigerian home cooking made with love. Jollof rice, egusi soup, and more. Every dish is a taste of home.',
    ARRAY['Nigerian','African','Halal'], 4.9, 128, true, 5, 40.6782, -73.9442, 35
  ),
  (
    'Rosa''s Mexican Cocina',
    'Traditional Mexican recipes passed down from my grandmother in Oaxaca. Everything made fresh daily.',
    ARRAY['Mexican','Vegan','Spicy'], 4.7, 94, true, 4, 40.6801, -73.9469, 25
  ),
  (
    'Priya''s Tiffin Box',
    'Home-style Indian curries, dals, and fresh roti. Vegetarian-friendly and made with love every day.',
    ARRAY['Indian','Vegetarian','Vegan'], 4.8, 211, false, 6, 40.6815, -73.9408, 40
  ),
  (
    'Miss Bonnie''s Soul Food',
    'Southern comfort food that tastes just like grandma made it. Made fresh every day with love.',
    ARRAY['Soul Food','Southern','American'], 4.95, 67, true, 3, 40.6755, -73.9501, 45
  ),
  (
    'Ming''s Dim Sum',
    'Hand-made dumplings and bao fresh every morning. Limited quantities — order early!',
    ARRAY['Chinese','Asian'], 4.6, 183, true, 5, 40.6768, -73.9432, 20
  ),
  (
    'Aunty Pat''s Caribbean',
    'Jamaican jerk chicken, oxtail, and rice & peas. Taste the islands every day!',
    ARRAY['Caribbean','Jamaican','Spicy'], 4.85, 142, true, 4, 40.6790, -73.9488, 50
  );

-- Insert menu items (using subqueries to get maker IDs)
INSERT INTO public.menu_items
  (maker_id, name, description, price, dietary_tags, is_available, prep_time_mins, category)
VALUES
  -- Mama Adaeze
  ((SELECT id FROM food_makers WHERE display_name = 'Mama Adaeze''s Kitchen'), 'Jollof Rice + Chicken', 'Party-style jollof rice with seasoned grilled chicken and fried plantain.', 18.00, ARRAY['halal'], true, 35, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Mama Adaeze''s Kitchen'), 'Egusi Soup + Fufu', 'Rich melon seed soup with assorted meats, served with freshly pounded fufu.', 22.00, ARRAY['halal'], true, 40, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Mama Adaeze''s Kitchen'), 'Puff Puff (6 pcs)', 'Freshly fried Nigerian doughnuts, light and airy with a hint of sweetness.', 6.00, ARRAY['vegan'], true, 10, 'Snacks'),
  ((SELECT id FROM food_makers WHERE display_name = 'Mama Adaeze''s Kitchen'), 'Pepper Soup', 'Spicy and aromatic Nigerian pepper soup with goat meat.', 14.00, ARRAY['halal','spicy'], true, 30, 'Soups'),

  -- Rosa
  ((SELECT id FROM food_makers WHERE display_name = 'Rosa''s Mexican Cocina'), 'Mole Negro Enchiladas', 'Handmade corn tortillas with pulled chicken in rich Oaxacan black mole.', 16.00, ARRAY[]::text[], true, 25, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Rosa''s Mexican Cocina'), 'Tamales (3 pcs)', 'Traditional masa tamales with pork verde filling, wrapped in corn husk.', 12.00, ARRAY[]::text[], true, 15, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Rosa''s Mexican Cocina'), 'Vegan Tlayuda', 'Crispy tortilla with black beans, avocado, and fresh salsa.', 13.00, ARRAY['vegan'], true, 20, 'Mains'),

  -- Priya
  ((SELECT id FROM food_makers WHERE display_name = 'Priya''s Tiffin Box'), 'Dal Makhani + Roti', 'Slow-cooked black lentils in a rich tomato-cream sauce with fresh roti.', 14.00, ARRAY['vegetarian'], true, 35, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Priya''s Tiffin Box'), 'Paneer Butter Masala', 'Soft paneer in a velvety tomato-cashew gravy. Best with naan.', 15.00, ARRAY['vegetarian'], true, 30, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Priya''s Tiffin Box'), 'Aloo Gobi', 'Spiced cauliflower and potato stir-fry, vegan and gluten-free.', 12.00, ARRAY['vegan','gluten-free'], true, 25, 'Mains'),

  -- Miss Bonnie
  ((SELECT id FROM food_makers WHERE display_name = 'Miss Bonnie''s Soul Food'), 'Fried Chicken & Waffles', 'Crispy Southern fried chicken on fluffy buttermilk waffles with maple syrup.', 19.00, ARRAY[]::text[], true, 45, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Miss Bonnie''s Soul Food'), 'Mac & Cheese (lg)', 'Baked 4-cheese mac loaded with breadcrumbs. Pure comfort.', 11.00, ARRAY[]::text[], true, 20, 'Sides'),
  ((SELECT id FROM food_makers WHERE display_name = 'Miss Bonnie''s Soul Food'), 'Oxtail Stew', 'Slow-braised oxtail with butter beans, carrots, and herbs. Served with rice.', 24.00, ARRAY[]::text[], true, 45, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Miss Bonnie''s Soul Food'), 'Collard Greens', 'Slow-cooked Southern collard greens with smoked turkey.', 8.00, ARRAY[]::text[], true, 15, 'Sides'),

  -- Ming
  ((SELECT id FROM food_makers WHERE display_name = 'Ming''s Dim Sum'), 'Pork Dumplings (8 pcs)', 'Juicy hand-folded pork & ginger dumplings, steamed or pan-fried.', 13.00, ARRAY[]::text[], true, 20, 'Dim Sum'),
  ((SELECT id FROM food_makers WHERE display_name = 'Ming''s Dim Sum'), 'BBQ Pork Bao (3 pcs)', 'Fluffy steamed buns filled with sweet char siu pork.', 10.00, ARRAY[]::text[], true, 15, 'Bao'),
  ((SELECT id FROM food_makers WHERE display_name = 'Ming''s Dim Sum'), 'Vegetable Har Gow (6 pcs)', 'Crystal-wrapped translucent dumplings with mixed vegetables.', 11.00, ARRAY['vegan'], true, 20, 'Dim Sum'),
  ((SELECT id FROM food_makers WHERE display_name = 'Ming''s Dim Sum'), 'Egg Tarts (3 pcs)', 'Silky smooth egg custard in a flaky pastry shell.', 7.00, ARRAY[]::text[], true, 5, 'Desserts'),

  -- Aunty Pat
  ((SELECT id FROM food_makers WHERE display_name = 'Aunty Pat''s Caribbean'), 'Jerk Chicken Plate', 'Slow-grilled jerk chicken with rice & peas and festival dumplings.', 18.00, ARRAY['spicy'], true, 50, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Aunty Pat''s Caribbean'), 'Oxtail + Rice', 'Tender braised oxtail with butter beans over steamed white rice.', 22.00, ARRAY[]::text[], true, 50, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Aunty Pat''s Caribbean'), 'Curry Goat', 'Slow-cooked goat in aromatic Caribbean curry with potato and roti.', 20.00, ARRAY['spicy'], true, 55, 'Mains'),
  ((SELECT id FROM food_makers WHERE display_name = 'Aunty Pat''s Caribbean'), 'Plantain (Sweet)', 'Pan-fried sweet plantain, crispy on the outside, soft inside.', 5.00, ARRAY['vegan'], true, 10, 'Sides');
-- Create avatars storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own avatar
create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own avatar
create policy "Users delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can view avatars (bucket is public)
create policy "Public avatar read"
  on storage.objects for select
  using (bucket_id = 'avatars');
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
-- Driver onboarding: KYC status, phone, and document storage

-- Add phone + KYC status to driver_profiles
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (kyc_status IN ('not_submitted', 'pending_review', 'approved', 'rejected'));

-- Driver KYC documents table (one row per driver)
CREATE TABLE IF NOT EXISTS driver_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  -- Personal info
  kyc_full_name        text,
  kyc_date_of_birth    date,
  kyc_ssn_last4        text,
  kyc_address          text,
  -- Document type + storage paths
  id_type              text CHECK (id_type IN ('drivers_license', 'passport', 'national_id')),
  front_path           text,
  back_path            text,
  selfie_path          text,
  -- Review state
  submitted_at         timestamptz DEFAULT now(),
  reviewed_at          timestamptz,
  reviewed_by          uuid REFERENCES auth.users,
  review_notes         text
);

ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_documents_insert_own"
  ON driver_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "driver_documents_select_own"
  ON driver_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "driver_documents_admin_all"
  ON driver_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Private storage bucket for driver document photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "driver_docs_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'driver-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "driver_docs_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'driver-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "driver_docs_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'driver-documents' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
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
-- Remove test/mock orders created during development
DELETE FROM order_items;
DELETE FROM orders;
-- Add motorbike vehicle type
ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_vehicle_type_check;
ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_vehicle_type_check
  CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'foot'));

-- Add insurance, background check and avatar fields
ALTER TABLE driver_documents
  ADD COLUMN IF NOT EXISTS insurance_path      text,
  ADD COLUMN IF NOT EXISTS bg_check_consent    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bg_check_consented_at timestamptz;

-- Store avatar as a path in the driver-documents bucket
-- driver_profiles.avatar_url already exists (text) — repurpose to store signed URL
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
-- Create menu-items storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-items',
  'menu-items',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder
create policy "Makers upload menu item photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-items' and (storage.foldername(name))[1] = auth.uid()::text);

-- Authenticated users can replace their own files
create policy "Makers update menu item photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-items' and (storage.foldername(name))[1] = auth.uid()::text);

-- Authenticated users can delete their own files
create policy "Makers delete menu item photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-items' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can view menu item photos (bucket is public)
create policy "Public menu item photo read"
  on storage.objects for select
  using (bucket_id = 'menu-items');
-- Add notification preferences and Stripe customer ID to users

alter table public.users
  add column if not exists notification_prefs jsonb not null
    default '{"pushOrders":true,"pushMessages":true,"pushPromos":false,"soundEnabled":true}'::jsonb,
  add column if not exists stripe_customer_id text;
-- ============================================================
-- Migration 012: Cash payment, missing columns, and RLS fixes
-- ============================================================

-- Payment method: 'card' (Stripe) or 'cash' (pay on delivery)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card'
    CHECK (payment_method IN ('card', 'cash'));

-- Financial breakdown columns (from migration 006 — may not have been applied)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_payout   numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS maker_payout    numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee     numeric(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS small_order_fee numeric(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS surge_fee       numeric(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_priority     boolean       NOT NULL DEFAULT false;

-- Index for cash-order reporting
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders (payment_method);

-- ============================================================
-- CRITICAL: RLS policies for makers and drivers to read orders
-- Without these, maker dashboards and driver order lists return
-- empty results because only customer RLS policies existed.
-- ============================================================

-- Makers can view orders for their kitchen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Makers view their orders'
  ) THEN
    CREATE POLICY "Makers view their orders"
      ON public.orders FOR SELECT
      USING (
        maker_id IN (
          SELECT id FROM public.food_makers WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Drivers can view: orders assigned to them, OR orders ready for pickup (unassigned)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Drivers view available and assigned orders'
  ) THEN
    CREATE POLICY "Drivers view available and assigned orders"
      ON public.orders FOR SELECT
      USING (
        nexter_id = auth.uid()
        OR (status = 'ready' AND nexter_id IS NULL)
      );
  END IF;
END $$;

-- Makers can update order status (confirm, preparing, ready) on their orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Makers update their order status'
  ) THEN
    CREATE POLICY "Makers update their order status"
      ON public.orders FOR UPDATE
      USING (
        maker_id IN (
          SELECT id FROM public.food_makers WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Drivers can update orders assigned to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Drivers update assigned orders'
  ) THEN
    CREATE POLICY "Drivers update assigned orders"
      ON public.orders FOR UPDATE
      USING (nexter_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- RLS for order_items: makers and drivers need to read items
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_items' AND policyname = 'Makers view their order items'
  ) THEN
    CREATE POLICY "Makers view their order items"
      ON public.order_items FOR SELECT
      USING (
        order_id IN (
          SELECT id FROM public.orders
          WHERE maker_id IN (
            SELECT id FROM public.food_makers WHERE user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_items' AND policyname = 'Drivers view their order items'
  ) THEN
    CREATE POLICY "Drivers view their order items"
      ON public.order_items FOR SELECT
      USING (
        order_id IN (
          SELECT id FROM public.orders
          WHERE nexter_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================
-- Driver withdrawal requests
-- ============================================================
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS user_role text NOT NULL DEFAULT 'driver';

-- RLS: drivers can insert their own withdrawal requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'withdrawals' AND policyname = 'Drivers insert own withdrawals'
  ) THEN
    CREATE POLICY "Drivers insert own withdrawals"
      ON public.withdrawals FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'withdrawals' AND policyname = 'Users view own withdrawals'
  ) THEN
    CREATE POLICY "Users view own withdrawals"
      ON public.withdrawals FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
-- Create banners storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'banners',
  'banners',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Users upload own banner"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own banner
create policy "Users update own banner"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own banner
create policy "Users delete own banner"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can view banners (bucket is public)
create policy "Public banner read"
  on storage.objects for select
  using (bucket_id = 'banners');
-- Fix 1: Add UPDATE policy for food_makers so makers can edit their own profile
--        (bio, display_name, etc.). Previously only SELECT was allowed, causing
--        silent update failures on the settings page.
create policy "Makers can update their own profile"
  on public.food_makers for update using (user_id = auth.uid());

-- Fix 2: Ensure driver_payout and maker_payout columns exist on orders.
--        Added in 006 and 012 but guard with IF NOT EXISTS for databases
--        that may not have those migrations fully applied.
alter table public.orders
  add column if not exists driver_payout numeric(10,2) not null default 0,
  add column if not exists maker_payout  numeric(10,2) not null default 0;

-- Fix 3: Ensure other columns added by 012 also exist
alter table public.orders
  add column if not exists service_fee     numeric(10,2) not null default 0,
  add column if not exists small_order_fee numeric(10,2) not null default 0,
  add column if not exists surge_fee       numeric(10,2) not null default 0,
  add column if not exists is_priority     boolean not null default false;

-- payment_method needs a separate statement so we can add the CHECK constraint safely
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_method'
  ) then
    alter table public.orders
      add column payment_method text not null default 'card'
        check (payment_method in ('card', 'cash'));
  end if;
end $$;
-- Migration 015: Customer can update delivery_address on their own pending order
--               + stronger SELECT policy so active orders are always visible

-- Customers can update the delivery_address field on their own orders while
-- the order is still pending (i.e. not yet confirmed by the maker).
-- The checkout page does this right after Stripe payment redirects back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Customers update delivery address'
  ) THEN
    CREATE POLICY "Customers update delivery address"
      ON public.orders
      FOR UPDATE
      USING (customer_id = auth.uid())
      WITH CHECK (customer_id = auth.uid());
  END IF;
END $$;

-- Ensure the base customer SELECT policy exists (re-create if somehow missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Customers view their own orders'
  ) THEN
    CREATE POLICY "Customers view their own orders"
      ON public.orders
      FOR SELECT
      USING (auth.uid() = customer_id);
  END IF;
END $$;
-- Migration 016: Remove seed data + admin fixes
-- Removes the fake food_makers from migration 002 (user_id IS NULL means they were seeded without a real auth account)
-- Safe to run multiple times (DELETE ... WHERE is idempotent).

-- 1. Remove order_items referencing seeded menu items
DELETE FROM order_items
WHERE menu_item_id IN (
  SELECT id FROM menu_items
  WHERE maker_id IN (SELECT id FROM food_makers WHERE user_id IS NULL)
);

-- 2. Remove order_items referencing seeded maker orders
DELETE FROM order_items
WHERE order_id IN (
  SELECT id FROM orders
  WHERE maker_id IN (SELECT id FROM food_makers WHERE user_id IS NULL)
);

-- 3. Remove orders referencing seeded makers
DELETE FROM orders
WHERE maker_id IN (SELECT id FROM food_makers WHERE user_id IS NULL);

-- 4. Remove seeded menu items
DELETE FROM menu_items
WHERE maker_id IN (SELECT id FROM food_makers WHERE user_id IS NULL);

-- 5. Remove seeded food makers
DELETE FROM food_makers WHERE user_id IS NULL;
-- Migration 017: Delivery batch support for combined orders
-- When a driver picks up multiple orders in one trip (combined delivery),
-- their payout is 80% of the combined delivery fees + 100% of tips.
-- This migration adds the schema; batch assignment logic comes in a future update.

ALTER TABLE orders ADD COLUMN delivery_batch_id uuid;
ALTER TABLE orders ADD COLUMN is_combined_delivery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.delivery_batch_id IS 'Groups multiple orders delivered together in a single trip. All orders in a batch share the same UUID.';
COMMENT ON COLUMN orders.is_combined_delivery IS 'True when this order was delivered as part of a batch. Driver payout is 80% of combined delivery fees + 100% of tips.';
-- Add new driver delivery flow statuses to order_status enum
-- Full 8-step flow:
--   accept → driver_assigned
--   arrive at maker → arrived_at_maker
--   confirm pickup → picked_up
--   start dropoff → on_the_way
--   arrive at customer → arrived_at_customer
--   complete → delivered

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'driver_assigned';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'arrived_at_maker';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'arrived_at_customer';
-- Failed delivery flow: driver arrives at customer but cannot complete delivery
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed_delivery';

-- Store reason for failed delivery (set by driver)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS failed_delivery_reason text;
-- Pickup PIN: 4-digit code generated when a driver accepts an order.
-- The maker must enter this PIN (received verbally from the driver) to confirm
-- the handoff and advance the order to 'picked_up'. Mandatory — drivers can no
-- longer self-confirm pickup.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_pin  char(4),
  ADD COLUMN IF NOT EXISTS pin_attempts smallint NOT NULL DEFAULT 0;

-- Hard-lock: more than 5 failed attempts triggers a support escalation
-- (enforced in the API layer). The column tracks cumulative bad guesses so
-- support staff can audit abuse.
COMMENT ON COLUMN orders.pickup_pin    IS '4-digit code shown to driver; maker must enter it to confirm pickup handoff';
COMMENT ON COLUMN orders.pin_attempts  IS 'Number of failed PIN entry attempts by the maker; resets on successful confirmation';
-- Migration 021: Security hardening
-- P0: Fix nexter_locations RLS (restrict to order participants)
-- P2: Add stripe_processed_events (webhook idempotency)
-- P2: Add admin_audit_log (admin action audit trail)

-- ============================================================
-- 1. Fix nexter_locations RLS (P0 Critical)
--    Previously anyone could read all driver GPS locations.
--    Now only: the driver themselves, OR parties with an active
--    order currently being delivered by that driver.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view nexter locations" ON public.nexter_locations;

-- Drivers can always read/write their own location row
CREATE POLICY "Drivers manage own location"
  ON public.nexter_locations
  FOR ALL
  USING (nexter_id = auth.uid())
  WITH CHECK (nexter_id = auth.uid());

-- Customers and makers can read a driver location only while
-- there is an active order linking them to that driver.
CREATE POLICY "Order participants can view driver location"
  ON public.nexter_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.nexter_id = nexter_locations.nexter_id
        AND o.status IN (
          'driver_assigned',
          'arrived_at_maker',
          'picked_up',
          'on_the_way',
          'arrived_at_customer'
        )
        AND (
          -- customer who placed the order
          o.customer_id = auth.uid()
          OR
          -- maker whose kitchen the order is from
          o.maker_id IN (
            SELECT id FROM public.food_makers WHERE user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- 2. Restrict delivery_address visibility for drivers
--    browsing unassigned (available) orders.
--    We cannot do true column-level RLS, so we replace the
--    broad drivers_see_orders SELECT policy with two targeted
--    policies:
--      a) Driver assigned to order: full row access
--      b) Driver browsing ready orders: full row access is
--         acceptable here since they need address to decide,
--         BUT we tighten using a separate view approach below.
-- ============================================================
-- NOTE: Full column-level restriction requires app-level query
-- trimming (omit delivery_address when fetching available orders).
-- The driver app's /available page already should only request
-- fields needed for the card (see app query). This migration
-- documents the intent and the app-level fix is in the driver
-- available orders query.

-- ============================================================
-- 3. stripe_processed_events — Webhook idempotency (P2)
--    Stores Stripe event IDs that have already been processed
--    to prevent duplicate order creation / state mutations.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id   text PRIMARY KEY,             -- Stripe evt_xxx id
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role (backend webhook handler) reads/writes this table.
ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role bypasses RLS.

-- Auto-purge events older than 30 days to keep the table small.
-- (Implement via pg_cron or a periodic cleanup job in production.)

COMMENT ON TABLE public.stripe_processed_events IS
  'Idempotency store for Stripe webhook events. Processed event IDs are '
  'inserted here before mutating order state; duplicate deliveries abort.';

-- ============================================================
-- 4. admin_audit_log — Admin action audit trail (P2)
--    Every privileged admin action (refund, KYC approve/reject,
--    manual order cancel, settings change) must insert a row here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES public.users(id),
  action       text NOT NULL,          -- e.g. 'refund', 'kyc_approve', 'order_cancel'
  target_type  text,                   -- e.g. 'order', 'driver', 'user'
  target_id    text,                   -- ID of the affected record
  payload      jsonb,                  -- additional context (amount, reason, etc.)
  ip_address   text,                   -- originating IP from request headers
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can INSERT audit rows (service role also bypasses RLS)
CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can read all audit log entries
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE public.admin_audit_log IS
  'Immutable audit trail for all privileged admin operations. '
  'Rows must never be updated or deleted in production.';

-- Index for common queries (filter by admin or by target)
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx
  ON public.admin_audit_log (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_type, target_id, created_at DESC);
-- Order claims: customers can report issues with delivered orders
-- and request a refund or replacement from the maker.

CREATE TABLE IF NOT EXISTS public.order_claims (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id   UUID        NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('refund', 'replacement')),
  reason        TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  seller_notes  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  processed_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_order_claims_order_id     ON public.order_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_order_claims_customer_id  ON public.order_claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_claims_status       ON public.order_claims(status);

ALTER TABLE public.order_claims ENABLE ROW LEVEL SECURITY;

-- Customers can view their own claims
CREATE POLICY "Customers can view own claims"
  ON public.order_claims FOR SELECT
  USING (auth.uid() = customer_id);

-- Customers can create claims only for their own delivered orders
CREATE POLICY "Customers can create claims for delivered orders"
  ON public.order_claims FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id      = order_claims.order_id
        AND orders.customer_id = auth.uid()
        AND orders.status   = 'delivered'
    )
  );

-- Makers can view claims on their orders
CREATE POLICY "Makers can view claims for their orders"
  ON public.order_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.food_makers fm ON fm.id = o.maker_id
      WHERE o.id = order_claims.order_id
        AND fm.user_id = auth.uid()
    )
  );

-- Makers can update (approve/reject) claims on their orders
CREATE POLICY "Makers can update claims for their orders"
  ON public.order_claims FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.food_makers fm ON fm.id = o.maker_id
      WHERE o.id = order_claims.order_id
        AND fm.user_id = auth.uid()
    )
  );

-- Admins have full access via service role (used by admin API routes)
CREATE POLICY "Admins full access"
  ON public.order_claims FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- Migration 023: Profile column safety + backfill
-- ============================================================

-- Ensure all optional columns exist on the users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL
    DEFAULT '{"pushOrders":true,"pushMessages":true,"pushPromos":false,"soundEnabled":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Backfill: create a public.users row for any auth user who is missing one
-- (handles accounts created before the trigger was set up)
INSERT INTO public.users (id, email, full_name, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', ''),
  au.created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
);
