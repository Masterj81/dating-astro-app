-- Seed 30 US profiles for launch
-- Major cities: NYC, LA, Chicago, Miami, Austin, SF, Boston, Denver, Seattle, DC
-- Password: SeedUser2026!

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  ids UUID[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,30));
  pw TEXT := crypt('SeedUser2026!', gen_salt('bf'));
  inst UUID := '00000000-0000-0000-0000-000000000000';
BEGIN

  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, reauthentication_token)
  SELECT ids[i], inst, e, pw, NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', '', '', '', '', ''
  FROM (VALUES
    (1,  'seed.olivia.nyc@astrodating.test'),
    (2,  'seed.james.nyc@astrodating.test'),
    (3,  'seed.mia.la@astrodating.test'),
    (4,  'seed.logan.la@astrodating.test'),
    (5,  'seed.ava.chi@astrodating.test'),
    (6,  'seed.noah.chi@astrodating.test'),
    (7,  'seed.isabella.mia@astrodating.test'),
    (8,  'seed.liam.mia@astrodating.test'),
    (9,  'seed.harper.atx@astrodating.test'),
    (10, 'seed.jackson.atx@astrodating.test'),
    (11, 'seed.aria.sf@astrodating.test'),
    (12, 'seed.caleb.sf@astrodating.test'),
    (13, 'seed.scarlett.bos@astrodating.test'),
    (14, 'seed.owen.bos@astrodating.test'),
    (15, 'seed.violet.den@astrodating.test'),
    (16, 'seed.wyatt.den@astrodating.test'),
    (17, 'seed.lily.sea@astrodating.test'),
    (18, 'seed.carter.sea@astrodating.test'),
    (19, 'seed.stella.dc@astrodating.test'),
    (20, 'seed.henry.dc@astrodating.test'),
    (21, 'seed.grace.nyc@astrodating.test'),
    (22, 'seed.aiden.la@astrodating.test'),
    (23, 'seed.chloe.chi@astrodating.test'),
    (24, 'seed.mason.mia@astrodating.test'),
    (25, 'seed.riley.atx@astrodating.test'),
    (26, 'seed.elijah.sf@astrodating.test'),
    (27, 'seed.zoe.nyc@astrodating.test'),
    (28, 'seed.luke.la@astrodating.test'),
    (29, 'seed.hazel.bos@astrodating.test'),
    (30, 'seed.dylan.den@astrodating.test')
  ) AS t(i, e)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (
    id, email, name, age, birth_date, birth_time, birth_city,
    birth_latitude, birth_longitude, gender, looking_for, bio,
    sun_sign, moon_sign, rising_sign,
    current_city, current_latitude, current_longitude,
    onboarding_completed, is_active, last_active, created_at, updated_at
  ) VALUES

  -- ── NEW YORK CITY ──

  (ids[1], 'seed.olivia.nyc@astrodating.test', 'Olivia', 26, '1999-04-14', '07:30:00', 'Brooklyn, NY',
   40.6782, -73.9442, 'female', ARRAY['male'],
   'Publishing editor by day, rooftop stargazer by night. Aries energy with a soft Pisces moon — I''ll fight for you then write you a poem.',
   'aries', 'pisces', 'leo', 'New York, NY', 40.7128, -74.0060,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  (ids[2], 'seed.james.nyc@astrodating.test', 'James', 29, '1996-07-22', '18:00:00', 'Manhattan, NY',
   40.7831, -73.9712, 'male', ARRAY['female'],
   'Wall Street analyst who''d rather talk about your moon sign than market trends. Cancer sun — emotionally available, financially stable.',
   'cancer', 'taurus', 'scorpio', 'New York, NY', 40.7128, -74.0060,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  (ids[21], 'seed.grace.nyc@astrodating.test', 'Grace', 24, '2001-10-28', '11:00:00', 'Queens, NY',
   40.7282, -73.7949, 'female', ARRAY['male'],
   'Dancer and Scorpio rising — mysterious until you get past the first date. Then I won''t stop talking.',
   'scorpio', 'leo', 'scorpio', 'New York, NY', 40.7128, -74.0060,
   true, true, NOW() - interval '30 minutes', NOW(), NOW()),

  (ids[27], 'seed.zoe.nyc@astrodating.test', 'Zoë', 25, '2000-02-18', '20:30:00', 'Williamsburg, NY',
   40.7081, -73.9571, 'female', ARRAY['male', 'female'],
   'Tattoo artist and Aquarius. I read tarot on Sundays and question everything on Mondays. Show me something real.',
   'aquarius', 'sagittarius', 'gemini', 'New York, NY', 40.7128, -74.0060,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  -- ── LOS ANGELES ──

  (ids[3], 'seed.mia.la@astrodating.test', 'Mia', 25, '2000-08-19', '14:00:00', 'Santa Monica, CA',
   34.0195, -118.4912, 'female', ARRAY['male'],
   'Screenwriter with main character energy. Leo sun, Libra moon — I need drama on screen, harmony at home.',
   'leo', 'libra', 'aries', 'Los Angeles, CA', 34.0522, -118.2437,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  (ids[4], 'seed.logan.la@astrodating.test', 'Logan', 28, '1997-12-08', '05:15:00', 'Silver Lake, CA',
   34.0869, -118.2702, 'male', ARRAY['female'],
   'Music producer and Sagittarius. I''ll make you a playlist before I make you dinner. Both will be fire.',
   'sagittarius', 'aries', 'cancer', 'Los Angeles, CA', 34.0522, -118.2437,
   true, true, NOW() - interval '5 hours', NOW(), NOW()),

  (ids[22], 'seed.aiden.la@astrodating.test', 'Aiden', 27, '1998-05-15', '10:45:00', 'Venice, CA',
   33.9850, -118.4695, 'male', ARRAY['female'],
   'Surf instructor and personal trainer. Taurus through and through — patient, sensual, and I cook a mean brunch.',
   'taurus', 'cancer', 'pisces', 'Los Angeles, CA', 34.0522, -118.2437,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  (ids[28], 'seed.luke.la@astrodating.test', 'Luke', 30, '1995-09-05', '16:00:00', 'Echo Park, CA',
   34.0782, -118.2606, 'male', ARRAY['female'],
   'Documentary filmmaker. Virgo who notices every detail — including the way you smile when you think no one''s watching.',
   'virgo', 'aquarius', 'taurus', 'Los Angeles, CA', 34.0522, -118.2437,
   true, true, NOW() - interval '6 hours', NOW(), NOW()),

  -- ── CHICAGO ──

  (ids[5], 'seed.ava.chi@astrodating.test', 'Ava', 27, '1998-06-15', '09:30:00', 'Chicago, IL',
   41.8781, -87.6298, 'female', ARRAY['male'],
   'Jazz singer and Gemini sun. I''ll serenade you at Kingston Mines, then debate philosophy until 3 AM.',
   'gemini', 'libra', 'sagittarius', 'Chicago, IL', 41.8781, -87.6298,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  (ids[6], 'seed.noah.chi@astrodating.test', 'Noah', 31, '1994-01-25', '22:00:00', 'Chicago, IL',
   41.8781, -87.6298, 'male', ARRAY['female'],
   'Aquarius chef at a Michelin-starred restaurant. I taste-test emotions like I taste-test sauces — carefully.',
   'aquarius', 'virgo', 'libra', 'Chicago, IL', 41.8781, -87.6298,
   true, true, NOW() - interval '7 hours', NOW(), NOW()),

  (ids[23], 'seed.chloe.chi@astrodating.test', 'Chloé', 23, '2002-11-15', '13:30:00', 'Wicker Park, IL',
   41.9088, -87.6796, 'female', ARRAY['male'],
   'Vintage shop owner and Scorpio. I''ll read your energy before I read your message. Don''t be fake.',
   'scorpio', 'capricorn', 'aries', 'Chicago, IL', 41.8781, -87.6298,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- ── MIAMI ──

  (ids[7], 'seed.isabella.mia@astrodating.test', 'Isabella', 26, '1999-03-08', '06:00:00', 'Miami Beach, FL',
   25.7907, -80.1300, 'female', ARRAY['male'],
   'Marine biologist and Pisces. I understand the ocean and emotions equally well. Depth is my love language.',
   'pisces', 'cancer', 'virgo', 'Miami, FL', 25.7617, -80.1918,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  (ids[8], 'seed.liam.mia@astrodating.test', 'Liam', 28, '1997-08-03', '20:45:00', 'Brickell, FL',
   25.7617, -80.1918, 'male', ARRAY['female'],
   'Real estate developer and Leo. I build things that last — buildings and relationships. Loyalty is non-negotiable.',
   'leo', 'scorpio', 'capricorn', 'Miami, FL', 25.7617, -80.1918,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  (ids[24], 'seed.mason.mia@astrodating.test', 'Mason', 25, '2000-04-22', '15:00:00', 'Wynwood, FL',
   25.8015, -80.1994, 'male', ARRAY['female'],
   'Street artist and Taurus. I express love through art — expect murals, not just emojis.',
   'taurus', 'leo', 'sagittarius', 'Miami, FL', 25.7617, -80.1918,
   true, true, NOW() - interval '5 hours', NOW(), NOW()),

  -- ── AUSTIN ──

  (ids[9], 'seed.harper.atx@astrodating.test', 'Harper', 24, '2001-09-18', '08:00:00', 'Austin, TX',
   30.2672, -97.7431, 'female', ARRAY['male'],
   'Indie musician and Virgo. I organize my vinyl collection by mood, not genre. Detail-oriented in love too.',
   'virgo', 'pisces', 'aquarius', 'Austin, TX', 30.2672, -97.7431,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  (ids[10], 'seed.jackson.atx@astrodating.test', 'Jackson', 27, '1998-04-01', '12:30:00', 'Austin, TX',
   30.2672, -97.7431, 'male', ARRAY['female'],
   'Tech startup founder and Aries. I move fast in business and slow in love. Looking for someone worth the pause.',
   'aries', 'cancer', 'libra', 'Austin, TX', 30.2672, -97.7431,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  (ids[25], 'seed.riley.atx@astrodating.test', 'Riley', 26, '1999-12-02', '19:30:00', 'Austin, TX',
   30.2672, -97.7431, 'non-binary', ARRAY['male', 'female', 'non-binary', 'other'],
   'Comedy writer and Sagittarius. I''ll make you laugh so hard you forget to check my sun sign. Then I''ll tell you anyway.',
   'sagittarius', 'gemini', 'leo', 'Austin, TX', 30.2672, -97.7431,
   true, true, NOW() - interval '6 hours', NOW(), NOW()),

  -- ── SAN FRANCISCO ──

  (ids[11], 'seed.aria.sf@astrodating.test', 'Aria', 28, '1997-10-25', '03:00:00', 'San Francisco, CA',
   37.7749, -122.4194, 'female', ARRAY['male'],
   'UX designer and Scorpio. I design intuitive experiences — in apps and in relationships. No dark patterns allowed.',
   'scorpio', 'aquarius', 'gemini', 'San Francisco, CA', 37.7749, -122.4194,
   true, true, NOW() - interval '8 hours', NOW(), NOW()),

  (ids[12], 'seed.caleb.sf@astrodating.test', 'Caleb', 30, '1995-06-10', '17:00:00', 'San Francisco, CA',
   37.7749, -122.4194, 'male', ARRAY['female'],
   'Climate scientist and Gemini. I think about the future of the planet and the future of us. Both matter equally.',
   'gemini', 'capricorn', 'virgo', 'San Francisco, CA', 37.7749, -122.4194,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  (ids[26], 'seed.elijah.sf@astrodating.test', 'Elijah', 29, '1996-07-08', '11:15:00', 'Oakland, CA',
   37.8044, -122.2712, 'male', ARRAY['female', 'non-binary'],
   'Ceramics artist and Cancer. I shape clay the way I shape connections — with patience, warmth, and strong hands.',
   'cancer', 'taurus', 'libra', 'San Francisco, CA', 37.7749, -122.4194,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  -- ── BOSTON ──

  (ids[13], 'seed.scarlett.bos@astrodating.test', 'Scarlett', 25, '2000-05-08', '10:00:00', 'Cambridge, MA',
   42.3736, -71.1097, 'female', ARRAY['male'],
   'PhD student at MIT and Taurus. I prove theories by day and disprove dating myths by night. Substance over surface.',
   'taurus', 'aquarius', 'cancer', 'Boston, MA', 42.3601, -71.0589,
   true, true, NOW() - interval '5 hours', NOW(), NOW()),

  (ids[14], 'seed.owen.bos@astrodating.test', 'Owen', 27, '1998-11-22', '21:30:00', 'Boston, MA',
   42.3601, -71.0589, 'male', ARRAY['female'],
   'Emergency room doctor and Sagittarius. I stay calm under pressure and chaotic on karaoke nights. Balance.',
   'sagittarius', 'leo', 'taurus', 'Boston, MA', 42.3601, -71.0589,
   true, true, NOW() - interval '7 hours', NOW(), NOW()),

  (ids[29], 'seed.hazel.bos@astrodating.test', 'Hazel', 23, '2002-01-30', '08:45:00', 'Somerville, MA',
   42.3876, -71.0995, 'female', ARRAY['male', 'female'],
   'Bookshop barista and Aquarius. I recommend books based on birth charts. Try me.',
   'aquarius', 'pisces', 'cancer', 'Boston, MA', 42.3601, -71.0589,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- ── DENVER ──

  (ids[15], 'seed.violet.den@astrodating.test', 'Violet', 26, '1999-02-24', '16:15:00', 'Denver, CO',
   39.7392, -104.9903, 'female', ARRAY['male'],
   'Snowboard instructor and Pisces. I live at 5,280 feet but my emotions go much deeper. Mountain soul, ocean heart.',
   'pisces', 'taurus', 'sagittarius', 'Denver, CO', 39.7392, -104.9903,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  (ids[16], 'seed.wyatt.den@astrodating.test', 'Wyatt', 29, '1996-08-28', '07:30:00', 'Boulder, CO',
   40.0150, -105.2705, 'male', ARRAY['female'],
   'Brewery owner and Virgo. I craft beer with the same precision I craft a first date. Tasting notes available.',
   'virgo', 'cancer', 'leo', 'Denver, CO', 39.7392, -104.9903,
   true, true, NOW() - interval '6 hours', NOW(), NOW()),

  (ids[30], 'seed.dylan.den@astrodating.test', 'Dylan', 27, '1998-03-25', '14:00:00', 'Denver, CO',
   39.7392, -104.9903, 'male', ARRAY['female'],
   'Park ranger and Aries. I protect trails by day and explore emotions by night. Campfire conversations are my thing.',
   'aries', 'libra', 'capricorn', 'Denver, CO', 39.7392, -104.9903,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  -- ── SEATTLE ──

  (ids[17], 'seed.lily.sea@astrodating.test', 'Lily', 25, '2000-07-05', '11:45:00', 'Capitol Hill, WA',
   47.6253, -122.3222, 'female', ARRAY['male'],
   'Indie game developer and Cancer. I build worlds where love stories have happy endings. Life should too.',
   'cancer', 'gemini', 'pisces', 'Seattle, WA', 47.6062, -122.3321,
   true, true, NOW() - interval '9 hours', NOW(), NOW()),

  (ids[18], 'seed.carter.sea@astrodating.test', 'Carter', 31, '1994-11-10', '02:00:00', 'Seattle, WA',
   47.6062, -122.3321, 'male', ARRAY['female'],
   'Coffee roaster and Scorpio. I take my espresso and my connections the same way — intense, rich, no sugar-coating.',
   'scorpio', 'capricorn', 'aries', 'Seattle, WA', 47.6062, -122.3321,
   true, true, NOW() - interval '5 hours', NOW(), NOW()),

  -- ── WASHINGTON DC ──

  (ids[19], 'seed.stella.dc@astrodating.test', 'Stella', 27, '1998-01-10', '19:00:00', 'Georgetown, DC',
   38.9076, -77.0723, 'female', ARRAY['male'],
   'Foreign policy analyst and Capricorn. I negotiate treaties by day and boundaries by night. Both require diplomacy.',
   'capricorn', 'aries', 'libra', 'Washington, DC', 38.9072, -77.0369,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  (ids[20], 'seed.henry.dc@astrodating.test', 'Henry', 30, '1995-06-25', '08:15:00', 'Adams Morgan, DC',
   38.9214, -77.0424, 'male', ARRAY['female'],
   'Constitutional lawyer and Cancer. I argue cases in court but never in relationships. Home-cooked dinners are my closing argument.',
   'cancer', 'libra', 'virgo', 'Washington, DC', 38.9072, -77.0369,
   true, true, NOW() - interval '4 hours', NOW(), NOW())

  ON CONFLICT (id) DO NOTHING;

END;
$$;
