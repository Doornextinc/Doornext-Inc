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
