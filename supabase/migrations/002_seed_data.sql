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
