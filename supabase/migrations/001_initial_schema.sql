-- Enable PostGIS for geolocation queries
create extension if not exists "postgis";

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
