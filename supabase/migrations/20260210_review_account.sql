-- Review Account for Apple App Store & Google Play Store Review
-- Email: review@astrodatingapp.com
-- Password: AstroReview2024!

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  review_user_id UUID;
  hashed_password TEXT;
  v_instance_id UUID;
  existing_user_id UUID;
BEGIN
  -- Check if review account already exists
  SELECT id INTO existing_user_id FROM auth.users WHERE email = 'review@astrodatingapp.com';

  IF existing_user_id IS NOT NULL THEN
    review_user_id := existing_user_id;
    RAISE NOTICE 'Review account already exists with ID: %', review_user_id;
  ELSE
    -- Generate new user ID
    review_user_id := gen_random_uuid();

    -- Generate bcrypt hash for password with cost factor 10 (GoTrue standard)
    hashed_password := crypt('AstroReview2024!', gen_salt('bf', 10));

    -- Get the correct instance_id from existing users
    -- This ensures compatibility with both local dev and production Supabase
    SELECT instance_id INTO v_instance_id FROM auth.users LIMIT 1;
    IF v_instance_id IS NULL THEN
      -- Fallback for new projects with no users yet
      v_instance_id := '00000000-0000-0000-0000-000000000000';
    END IF;

    -- Insert user into auth.users
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
      role,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      review_user_id,
      v_instance_id,
      'review@astrodatingapp.com',
      hashed_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Alex"}',
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );

    RAISE NOTICE 'Created auth user with ID: %', review_user_id;
  END IF;

  -- Insert or update profile with complete birth chart data
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
  ) VALUES (
    review_user_id,
    'review@astrodatingapp.com',
    'Alex',
    28,
    '1996-11-15',
    '10:30:00',
    'San Francisco, CA',
    37.7749,
    -122.4194,
    'male',
    ARRAY['female'],
    'Passionate Scorpio who loves exploring the cosmos and meaningful connections. Software enthusiast and amateur astronomer. Looking for someone whose stars align with mine!',
    'scorpio',
    'pisces',
    'capricorn',
    'San Francisco, CA',
    37.7749,
    -122.4194,
    true,
    true,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    onboarding_completed = EXCLUDED.onboarding_completed,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

  RAISE NOTICE 'Review account ready!';
  RAISE NOTICE 'Email: review@astrodatingapp.com';
  RAISE NOTICE 'Password: AstroReview2024!';
  RAISE NOTICE 'User ID: %', review_user_id;
END $$;

-- Verify the account was created
SELECT
  p.name,
  p.sun_sign,
  p.moon_sign,
  p.rising_sign,
  p.gender,
  p.age,
  p.current_city,
  u.email,
  p.onboarding_completed
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'review@astrodatingapp.com';
