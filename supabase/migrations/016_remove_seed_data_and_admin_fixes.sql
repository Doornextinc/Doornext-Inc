-- Migration 016: Remove seed data + admin fixes
-- Removes the fake food_makers from migration 002 (user_id IS NULL means they were seeded without a real auth account)
-- Safe to run multiple times.

-- Remove seeded menu items first (FK constraint)
DELETE FROM menu_items
WHERE maker_id IN (
  SELECT id FROM food_makers WHERE user_id IS NULL
);

-- Remove seeded food makers
DELETE FROM food_makers WHERE user_id IS NULL;
