-- Add notification preferences and Stripe customer ID to users

alter table public.users
  add column if not exists notification_prefs jsonb not null
    default '{"pushOrders":true,"pushMessages":true,"pushPromos":false,"soundEnabled":true}'::jsonb,
  add column if not exists stripe_customer_id text;
