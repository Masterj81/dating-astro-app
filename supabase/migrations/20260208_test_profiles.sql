-- Test Profiles for Apple Review
-- Run this in Supabase SQL Editor
-- Password for all accounts: TestUser2024!

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create 8 test users with diverse profiles
DO $$
DECLARE
  user1_id UUID := gen_random_uuid();
  user2_id UUID := gen_random_uuid();
  user3_id UUID := gen_random_uuid();
  user4_id UUID := gen_random_uuid();
  user5_id UUID := gen_random_uuid();
  user6_id UUID := gen_random_uuid();
  user7_id UUID := gen_random_uuid();
  user8_id UUID := gen_random_uuid();
  hashed_password TEXT;
BEGIN
  -- Generate bcrypt hash for password "TestUser2024!"
  hashed_password := crypt('TestUser2024!', gen_salt('bf'));

  -- Insert users into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role
  ) VALUES
  (user1_id, '00000000-0000-0000-0000-000000000000', 'emma.fire@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user2_id, '00000000-0000-0000-0000-000000000000', 'lucas.earth@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user3_id, '00000000-0000-0000-0000-000000000000', 'sofia.air@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user4_id, '00000000-0000-0000-0000-000000000000', 'noah.water@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user5_id, '00000000-0000-0000-0000-000000000000', 'olivia.fire@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user6_id, '00000000-0000-0000-0000-000000000000', 'liam.earth@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user7_id, '00000000-0000-0000-0000-000000000000', 'ava.air@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  (user8_id, '00000000-0000-0000-0000-000000000000', 'mason.water@test.com', hashed_password, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated');

  -- Insert corresponding profiles
  INSERT INTO profiles (
    id,
    email,
    name,
    age,
    birth_date,
    birth_time,
    birth_city,
    birth_latitude,
    birth_longitude,
    gender,
    looking_for,
    bio,
    sun_sign,
    moon_sign,
    rising_sign,
    current_city,
    current_latitude,
    current_longitude,
    onboarding_completed,
    is_active,
    last_active,
    created_at,
    updated_at
  ) VALUES
  -- Emma - Aries, Female, 25, Los Angeles
  (user1_id, 'emma.fire@test.com', 'Emma', 25, '1999-03-28', '14:30:00', 'Los Angeles, CA', 34.0522, -118.2437,
   'female', ARRAY['male'],
   'Fire sign energy! Love hiking, yoga, and stargazing. Looking for someone who matches my adventurous spirit.',
   'aries', 'leo', 'sagittarius', 'Los Angeles, CA', 34.0522, -118.2437,
   true, true, NOW(), NOW(), NOW()),

  -- Lucas - Taurus, Male, 28, New York
  (user2_id, 'lucas.earth@test.com', 'Lucas', 28, '1996-05-05', '09:15:00', 'New York, NY', 40.7128, -74.0060,
   'male', ARRAY['female'],
   'Grounded Taurus who appreciates good food, art, and meaningful conversations. Software engineer by day, chef by night.',
   'taurus', 'capricorn', 'virgo', 'New York, NY', 40.7128, -74.0060,
   true, true, NOW(), NOW(), NOW()),

  -- Sofia - Gemini, Female, 23, Miami
  (user3_id, 'sofia.air@test.com', 'Sofia', 23, '2001-06-12', '16:45:00', 'Miami, FL', 25.7617, -80.1918,
   'female', ARRAY['male'],
   'Curious Gemini always learning something new. Fluent in 3 languages. Love dancing salsa and exploring new places!',
   'gemini', 'aquarius', 'libra', 'Miami, FL', 25.7617, -80.1918,
   true, true, NOW(), NOW(), NOW()),

  -- Noah - Cancer, Male, 31, Chicago
  (user4_id, 'noah.water@test.com', 'Noah', 31, '1993-07-08', '22:00:00', 'Chicago, IL', 41.8781, -87.6298,
   'male', ARRAY['female'],
   'Caring Cancer who values family and deep connections. Love cooking, photography, and cozy nights in.',
   'cancer', 'pisces', 'scorpio', 'Chicago, IL', 41.8781, -87.6298,
   true, true, NOW(), NOW(), NOW()),

  -- Olivia - Leo, Female, 27, San Francisco
  (user5_id, 'olivia.fire@test.com', 'Olivia', 27, '1997-08-15', '12:00:00', 'San Francisco, CA', 37.7749, -122.4194,
   'female', ARRAY['male'],
   'Creative Leo with a passion for theater and music. Marketing director who believes in following your heart.',
   'leo', 'aries', 'leo', 'San Francisco, CA', 37.7749, -122.4194,
   true, true, NOW(), NOW(), NOW()),

  -- Liam - Virgo, Male, 29, Seattle
  (user6_id, 'liam.earth@test.com', 'Liam', 29, '1995-09-03', '07:30:00', 'Seattle, WA', 47.6062, -122.3321,
   'male', ARRAY['female'],
   'Detail-oriented Virgo and coffee enthusiast. Data scientist who loves hiking in the Pacific Northwest.',
   'virgo', 'taurus', 'capricorn', 'Seattle, WA', 47.6062, -122.3321,
   true, true, NOW(), NOW(), NOW()),

  -- Ava - Libra, Female, 24, Boston
  (user7_id, 'ava.air@test.com', 'Ava', 24, '2000-10-10', '18:20:00', 'Boston, MA', 42.3601, -71.0589,
   'female', ARRAY['male'],
   'Harmony-seeking Libra studying art history. Love museums, vintage fashion, and deep conversations over wine.',
   'libra', 'gemini', 'aquarius', 'Boston, MA', 42.3601, -71.0589,
   true, true, NOW(), NOW(), NOW()),

  -- Mason - Scorpio, Male, 32, Denver
  (user8_id, 'mason.water@test.com', 'Mason', 32, '1992-11-07', '03:45:00', 'Denver, CO', 39.7392, -104.9903,
   'male', ARRAY['female'],
   'Intense Scorpio with a mysterious side. Psychologist, rock climbing enthusiast, and amateur astronomer.',
   'scorpio', 'cancer', 'pisces', 'Denver, CO', 39.7392, -104.9903,
   true, true, NOW(), NOW(), NOW());

  RAISE NOTICE 'Created 8 test users successfully!';
  RAISE NOTICE 'User IDs: %, %, %, %, %, %, %, %', user1_id, user2_id, user3_id, user4_id, user5_id, user6_id, user7_id, user8_id;
END $$;

-- Verify the profiles were created
SELECT p.name, p.sun_sign, p.gender, p.age, p.current_city, u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email LIKE '%@test.com'
ORDER BY p.name;
