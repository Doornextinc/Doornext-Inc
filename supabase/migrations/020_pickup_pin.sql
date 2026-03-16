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
