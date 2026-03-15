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
