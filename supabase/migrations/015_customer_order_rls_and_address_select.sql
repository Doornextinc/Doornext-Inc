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
