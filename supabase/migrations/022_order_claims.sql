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
