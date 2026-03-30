-- Seed 30 realistic profiles for launch
-- Diverse signs, ages, genders, cities (heavy on Montreal + surrounding)
-- Password: SeedUser2026!

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  ids UUID[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,30));
  pw TEXT := crypt('SeedUser2026!', gen_salt('bf'));
  inst UUID := '00000000-0000-0000-0000-000000000000';
BEGIN

  -- ── auth.users ──
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, reauthentication_token)
  SELECT
    ids[i],
    inst,
    e,
    pw,
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated',
    '', '', '', '', ''
  FROM (VALUES
    (1,  'seed.chloe@astrodating.test'),
    (2,  'seed.marco@astrodating.test'),
    (3,  'seed.amelie@astrodating.test'),
    (4,  'seed.felix@astrodating.test'),
    (5,  'seed.jasmine@astrodating.test'),
    (6,  'seed.ethan@astrodating.test'),
    (7,  'seed.lea@astrodating.test'),
    (8,  'seed.samuel@astrodating.test'),
    (9,  'seed.maya@astrodating.test'),
    (10, 'seed.olivier@astrodating.test'),
    (11, 'seed.sarah@astrodating.test'),
    (12, 'seed.alex@astrodating.test'),
    (13, 'seed.luna@astrodating.test'),
    (14, 'seed.gabriel@astrodating.test'),
    (15, 'seed.zara@astrodating.test'),
    (16, 'seed.raphael@astrodating.test'),
    (17, 'seed.nadia@astrodating.test'),
    (18, 'seed.thomas@astrodating.test'),
    (19, 'seed.iris@astrodating.test'),
    (20, 'seed.julien@astrodating.test'),
    (21, 'seed.elena@astrodating.test'),
    (22, 'seed.mathieu@astrodating.test'),
    (23, 'seed.sofia@astrodating.test'),
    (24, 'seed.antoine@astrodating.test'),
    (25, 'seed.camille@astrodating.test'),
    (26, 'seed.maxime@astrodating.test'),
    (27, 'seed.clara@astrodating.test'),
    (28, 'seed.nicolas@astrodating.test'),
    (29, 'seed.valerie@astrodating.test'),
    (30, 'seed.david@astrodating.test')
  ) AS t(i, e)
  ON CONFLICT (id) DO NOTHING;

  -- ── profiles ──
  INSERT INTO profiles (
    id, email, name, age, birth_date, birth_time, birth_city,
    birth_latitude, birth_longitude, gender, looking_for, bio,
    sun_sign, moon_sign, rising_sign,
    current_city, current_latitude, current_longitude,
    onboarding_completed, is_active, last_active, created_at, updated_at
  ) VALUES

  -- 1. Chloe - Aries, F, 24, Montreal
  (ids[1], 'seed.chloe@astrodating.test', 'Chloé', 24, '2001-04-05', '08:15:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Morning person, cat lover, and eternal optimist. Looking for someone who can keep up with my Aries energy.',
   'aries', 'cancer', 'gemini', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  -- 2. Marco - Taurus, M, 29, Montreal
  (ids[2], 'seed.marco@astrodating.test', 'Marco', 29, '1996-05-12', '20:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Chef in the making. I believe the way to someone''s heart is through good food and honest conversation.',
   'taurus', 'virgo', 'scorpio', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- 3. Amélie - Gemini, F, 26, Montreal
  (ids[3], 'seed.amelie@astrodating.test', 'Amélie', 26, '1999-06-08', '11:45:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male', 'female'],
   'Bilingual bookworm. I speak fluent sarcasm and passable French. Tell me your last great read.',
   'gemini', 'aquarius', 'libra', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '30 minutes', NOW(), NOW()),

  -- 4. Félix - Cancer, M, 27, Montreal
  (ids[4], 'seed.felix@astrodating.test', 'Félix', 27, '1998-07-15', '05:30:00', 'Laval, QC',
   45.6066, -73.7124, 'male', ARRAY['female'],
   'Musician and night owl. If you can appreciate a good vinyl record and a late-night walk, we''ll get along.',
   'cancer', 'pisces', 'taurus', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  -- 5. Jasmine - Leo, F, 25, Montreal
  (ids[5], 'seed.jasmine@astrodating.test', 'Jasmine', 25, '2000-08-02', '13:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Leo sun, Aries moon — double fire. Fashion design student who loves rooftop bars and deep conversations.',
   'leo', 'aries', 'leo', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '45 minutes', NOW(), NOW()),

  -- 6. Ethan - Virgo, M, 30, Montreal
  (ids[6], 'seed.ethan@astrodating.test', 'Ethan', 30, '1995-09-10', '07:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Software dev by day, amateur astronomer by night. Yes, I planned this profile very carefully.',
   'virgo', 'capricorn', 'cancer', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  -- 7. Léa - Libra, F, 23, Montreal
  (ids[7], 'seed.lea@astrodating.test', 'Léa', 23, '2002-10-01', '16:30:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male', 'female', 'non-binary', 'other'],
   'Art history student with too many plants. I believe in balance, beauty, and second dates.',
   'libra', 'taurus', 'pisces', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '20 minutes', NOW(), NOW()),

  -- 8. Samuel - Scorpio, M, 28, Montreal
  (ids[8], 'seed.samuel@astrodating.test', 'Samuel', 28, '1997-11-18', '23:15:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Intense by nature, loyal by choice. Rock climbing, philosophy podcasts, and strong espresso.',
   'scorpio', 'scorpio', 'aries', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- 9. Maya - Sagittarius, F, 27, Montreal
  (ids[9], 'seed.maya@astrodating.test', 'Maya', 27, '1998-12-05', '10:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Travel photographer chasing sunsets. 27 countries and counting. Looking for a co-pilot, not a passenger.',
   'sagittarius', 'gemini', 'aquarius', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '5 hours', NOW(), NOW()),

  -- 10. Olivier - Capricorn, M, 31, Montreal
  (ids[10], 'seed.olivier@astrodating.test', 'Olivier', 31, '1994-01-08', '06:45:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Architect who loves structure — in buildings and relationships. Weekend hiker, weekday dreamer.',
   'capricorn', 'libra', 'virgo', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  -- 11. Sarah - Aquarius, F, 26, Montreal
  (ids[11], 'seed.sarah@astrodating.test', 'Sarah', 26, '1999-02-14', '14:20:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Born on Valentine''s Day but still single. Coincidence? I think the stars have a sense of humor.',
   'aquarius', 'leo', 'sagittarius', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '15 minutes', NOW(), NOW()),

  -- 12. Alex - Pisces, NB, 25, Montreal
  (ids[12], 'seed.alex@astrodating.test', 'Alex', 25, '2000-03-12', '03:30:00', 'Montreal, QC',
   45.5017, -73.5673, 'non-binary', ARRAY['male', 'female', 'non-binary', 'other'],
   'Dreamer, painter, and hopeless romantic. My ideal date is a museum then coffee in the rain.',
   'pisces', 'cancer', 'libra', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '6 hours', NOW(), NOW()),

  -- 13. Luna - Aries, F, 22, Laval
  (ids[13], 'seed.luna@astrodating.test', 'Luna', 22, '2003-04-18', '09:00:00', 'Laval, QC',
   45.6066, -73.7124, 'female', ARRAY['male'],
   'Fitness enthusiast and astrology nerd. My Mars in Aries means I''ll always make the first move.',
   'aries', 'sagittarius', 'capricorn', 'Laval, QC', 45.6066, -73.7124,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  -- 14. Gabriel - Taurus, M, 26, Longueuil
  (ids[14], 'seed.gabriel@astrodating.test', 'Gabriel', 26, '1999-05-02', '18:00:00', 'Longueuil, QC',
   45.5312, -73.5185, 'male', ARRAY['female'],
   'Simple pleasures: good wine, fresh pasta, old movies. I''m the steady one in every friend group.',
   'taurus', 'cancer', 'aquarius', 'Longueuil, QC', 45.5312, -73.5185,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  -- 15. Zara - Gemini, F, 28, Montreal
  (ids[15], 'seed.zara@astrodating.test', 'Zara', 28, '1997-06-20', '12:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Marketing strategist who over-analyzes everything — including your texts. Gemini things.',
   'gemini', 'scorpio', 'aries', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- 16. Raphaël - Cancer, M, 24, Montreal
  (ids[16], 'seed.raphael@astrodating.test', 'Raphaël', 24, '2001-07-08', '22:30:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female', 'non-binary'],
   'Nursing student, plant dad, and Cancer rising — I''ll take care of you whether you like it or not.',
   'cancer', 'taurus', 'cancer', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  -- 17. Nadia - Leo, F, 29, Toronto
  (ids[17], 'seed.nadia@astrodating.test', 'Nadia', 29, '1996-08-15', '15:00:00', 'Toronto, ON',
   43.6532, -79.3832, 'female', ARRAY['male'],
   'Dance instructor with main character energy. My Leo sun demands attention, my Pisces moon craves depth.',
   'leo', 'pisces', 'gemini', 'Toronto, ON', 43.6532, -79.3832,
   true, true, NOW() - interval '5 hours', NOW(), NOW()),

  -- 18. Thomas - Virgo, M, 27, Toronto
  (ids[18], 'seed.thomas@astrodating.test', 'Thomas', 27, '1998-09-22', '04:00:00', 'Toronto, ON',
   43.6532, -79.3832, 'male', ARRAY['female'],
   'Data analyst. Yes, I made a spreadsheet of my ideal partner traits. No, I won''t share it on the first date.',
   'virgo', 'gemini', 'scorpio', 'Toronto, ON', 43.6532, -79.3832,
   true, true, NOW() - interval '7 hours', NOW(), NOW()),

  -- 19. Iris - Libra, F, 25, Montreal
  (ids[19], 'seed.iris@astrodating.test', 'Iris', 25, '2000-10-12', '11:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Interior designer who believes in feng shui and first impressions. Tell me about your living room.',
   'libra', 'aquarius', 'leo', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '30 minutes', NOW(), NOW()),

  -- 20. Julien - Scorpio, M, 32, Montreal
  (ids[20], 'seed.julien@astrodating.test', 'Julien', 32, '1993-11-03', '01:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Lawyer by day, jazz pianist by night. I don''t do small talk — let''s skip to the real conversation.',
   'scorpio', 'capricorn', 'pisces', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  -- 21. Elena - Sagittarius, F, 26, Montreal
  (ids[21], 'seed.elena@astrodating.test', 'Elena', 26, '1999-12-18', '17:45:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Yoga teacher and Sagittarius sun — I''ll stretch your mind and your hamstrings. Adventurers only.',
   'sagittarius', 'aries', 'taurus', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- 22. Mathieu - Capricorn, M, 28, Quebec City
  (ids[22], 'seed.mathieu@astrodating.test', 'Mathieu', 28, '1997-01-15', '08:30:00', 'Québec, QC',
   46.8139, -71.2080, 'male', ARRAY['female'],
   'Engineer who builds bridges — literally and emotionally. Weekend snowboarder, weeknight cook.',
   'capricorn', 'taurus', 'aries', 'Québec, QC', 46.8139, -71.2080,
   true, true, NOW() - interval '8 hours', NOW(), NOW()),

  -- 23. Sofia - Aquarius, F, 23, Montreal
  (ids[23], 'seed.sofia@astrodating.test', 'Sofia', 23, '2002-02-03', '19:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male', 'female'],
   'Film student with strong opinions about Kubrick. My Aquarius detachment is just a defense mechanism.',
   'aquarius', 'scorpio', 'cancer', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  -- 24. Antoine - Pisces, M, 25, Montreal
  (ids[24], 'seed.antoine@astrodating.test', 'Antoine', 25, '2000-03-01', '06:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Graphic designer who believes in signs — zodiac and otherwise. Coffee snob, vinyl collector.',
   'pisces', 'libra', 'gemini', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '4 hours', NOW(), NOW()),

  -- 25. Camille - Taurus, F, 27, Montreal
  (ids[25], 'seed.camille@astrodating.test', 'Camille', 27, '1998-04-25', '10:30:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Pastry chef. My love language is homemade croissants on Sunday mornings. Taurus energy at its finest.',
   'taurus', 'pisces', 'leo', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '1 hour', NOW(), NOW()),

  -- 26. Maxime - Gemini, M, 26, Montreal
  (ids[26], 'seed.maxime@astrodating.test', 'Maxime', 26, '1999-06-01', '14:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Stand-up comedian. If I can''t make you laugh in the first 5 minutes, I''ll try again in 10. Gemini persistence.',
   'gemini', 'leo', 'sagittarius', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '6 hours', NOW(), NOW()),

  -- 27. Clara - Leo, F, 24, Montreal
  (ids[27], 'seed.clara@astrodating.test', 'Clara', 24, '2001-08-08', '12:15:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Med student, weekend DJ, full-time Leo. I multitask in love too — expect attention and expect it loudly.',
   'leo', 'gemini', 'aries', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '45 minutes', NOW(), NOW()),

  -- 28. Nicolas - Libra, M, 30, Montreal
  (ids[28], 'seed.nicolas@astrodating.test', 'Nico', 30, '1995-10-07', '21:00:00', 'Montreal, QC',
   45.5017, -73.5673, 'male', ARRAY['female'],
   'Sommelier and hopeless romantic. I''ll pair a wine with your birth chart. Libra balance in a glass.',
   'libra', 'cancer', 'taurus', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '2 hours', NOW(), NOW()),

  -- 29. Valérie - Scorpio, F, 28, Montreal
  (ids[29], 'seed.valerie@astrodating.test', 'Valérie', 28, '1997-11-05', '02:30:00', 'Montreal, QC',
   45.5017, -73.5673, 'female', ARRAY['male'],
   'Psychologist in training. Yes, I''m analyzing your profile right now. Scorpio intuition is a superpower.',
   'scorpio', 'virgo', 'aquarius', 'Montreal, QC', 45.5017, -73.5673,
   true, true, NOW() - interval '3 hours', NOW(), NOW()),

  -- 30. David - Capricorn, M, 29, Ottawa
  (ids[30], 'seed.david@astrodating.test', 'David', 29, '1996-01-20', '09:15:00', 'Ottawa, ON',
   45.4215, -75.6972, 'male', ARRAY['female'],
   'Public servant by paycheck, trail runner by passion. Capricorn discipline means I never skip leg day.',
   'capricorn', 'sagittarius', 'leo', 'Ottawa, ON', 45.4215, -75.6972,
   true, true, NOW() - interval '5 hours', NOW(), NOW())

  ON CONFLICT (id) DO NOTHING;

END;
$$;
