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
