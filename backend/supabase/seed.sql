-- Local demo data mirroring the frontend mock content. Password for every account: courtside-demo

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'student@courtside.dev',
   crypt('courtside-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alex Carter"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'elena@courtside.dev',
   crypt('courtside-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Elena Moretti"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'marcus@courtside.dev',
   crypt('courtside-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Marcus Reid"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'student2@courtside.dev',
   crypt('courtside-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Jordan Lee"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'admin@courtside.dev',
   crypt('courtside-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Courtside Editors"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now() from auth.users;

update public.profiles set role = 'coach' where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
update public.profiles set role = 'admin' where id = '99999999-9999-9999-9999-999999999999';
update public.profiles set ntrp = 3.5, dominant_hand = 'right', backhand_style = 'one_handed', primary_playstyle = 'all_court'
  where id = '11111111-1111-1111-1111-111111111111';

insert into public.coaches (profile_id, headline, bio, philosophy, credentials, specialties, hourly_rate_cents, semi_private_rate_cents, verified) values
  ('22222222-2222-2222-2222-222222222222', 'Former WTA doubles player', 'Fifteen years coaching juniors and adults across Brooklyn.',
   'Simple technique, repeated with intent.', '{"USPTA Elite","PTR 10 & Under"}', '{"backhand","doubles"}', 9500, 6000, true),
  ('33333333-3333-3333-3333-333333333333', 'Footwork and fitness specialist', 'Collegiate All-American; strength coach.',
   'Win the first step and the rest follows.', '{"USPTA Professional"}', '{"footwork","serve"}', 8500, 5500, true);

insert into public.follows (student_id, coach_id) values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
insert into public.coach_students (coach_id, student_id) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');

insert into public.facilities (id, name, kind, address, city, lat, lng) values
  ('f0000000-0000-0000-0000-000000000001', 'Prospect Park Tennis Center', 'public_park', '50 Parkside Ave', 'Brooklyn', 40.6551, -73.9697),
  ('f0000000-0000-0000-0000-000000000002', 'McCarren Park', 'public_park', 'Lorimer St & Driggs Ave', 'Brooklyn', 40.7203, -73.9516),
  ('f0000000-0000-0000-0000-000000000003', 'Fort Greene Racquet Club', 'partner_club', '100 DeKalb Ave', 'Brooklyn', 40.6900, -73.9760);

insert into public.courts (id, facility_id, name, surface, indoor, lights, hourly_rate_cents) values
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Prospect Park · Court 4', 'hard', false, true, 2800),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Prospect Park · Bubble 1', 'hard', true, true, 3600),
  ('c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', 'McCarren · Court 2', 'hard', false, false, 1800),
  ('c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'Fort Greene · Clay 1', 'clay', false, true, 3200);

update public.profiles set home_court_id = 'c0000000-0000-0000-0000-000000000001' where id = '11111111-1111-1111-1111-111111111111';
insert into public.favorite_courts (player_id, court_id) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000004');

-- Hourly slots 7:00-21:00 local for the next 7 days.
insert into public.court_slots (court_id, starts_at, ends_at, status)
select c.id, t, t + interval '1 hour', case when random() < 0.35 then 'booked'::public.slot_status else 'open' end
from public.courts c
cross join generate_series(date_trunc('day', now() at time zone 'America/New_York') + interval '1 day 7 hours',
                           date_trunc('day', now() at time zone 'America/New_York') + interval '7 days 20 hours', interval '1 hour') g(local_t)
cross join lateral (select g.local_t at time zone 'America/New_York' as t) x
where extract(hour from g.local_t) between 7 and 20;

insert into public.court_alerts (player_id, facility_id, label, days, start_time, end_time) values
  ('11111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000001', 'Weeknight prime time', '{1,2,3,4,5}', '17:00', '21:00');

insert into public.coach_availability (coach_id, starts_at, ends_at, court_id)
select coach, t, t + interval '1 hour', 'c0000000-0000-0000-0000-000000000001'
from (values ('22222222-2222-2222-2222-222222222222'::uuid), ('33333333-3333-3333-3333-333333333333'::uuid)) c(coach)
cross join generate_series(date_trunc('day', now()) + interval '1 day 21 hours 30 minutes', date_trunc('day', now()) + interval '6 days 23 hours', interval '1 day') t;

insert into public.classes (coach_id, title, kind, description, level_min, level_max, court_id, starts_at, duration_min, capacity, price_cents) values
  ('22222222-2222-2222-2222-222222222222', 'One-handed backhand workshop', 'workshop', 'Grip, unit turn and the finish.', 3.0, 4.5,
   'c0000000-0000-0000-0000-000000000001', date_trunc('day', now()) + interval '2 days 23 hours', 90, 6, 4500),
  ('33333333-3333-3333-3333-333333333333', 'Cardio tennis', 'cardio', 'High-tempo feeding to music.', 2.0, 5.0,
   'c0000000-0000-0000-0000-000000000003', date_trunc('day', now()) + interval '3 days 12 hours', 60, 10, 3200),
  ('22222222-2222-2222-2222-222222222222', 'Doubles patterns clinic', 'clinic', 'Poaching, I-formation and serve plus one.', 3.5, 5.0,
   'c0000000-0000-0000-0000-000000000004', date_trunc('day', now()) + interval '5 days 22 hours', 90, 8, 3600);

insert into public.lesson_packages (coach_id, title, lesson_count, price_cents) values
  ('22222222-2222-2222-2222-222222222222', 'Five private lessons', 5, 42500),
  ('33333333-3333-3333-3333-333333333333', 'Ten-session footwork block', 10, 76500);

-- Training data -------------------------------------------------------------
insert into public.matches (id, player_id, opponent_name, played_at, surface, score, result, source) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'J. Alvarez', now() - interval '2 days', 'hard', '6-4 3-6 7-5', 'win', 'manual');

insert into public.match_points (match_id, seq, server, winner, serve_number, serve_side, serve_zone, rally_length, ending, ending_stroke, bounce_x, bounce_y)
select 'a0000000-0000-0000-0000-000000000001', i,
       case when (i / 6) % 2 = 0 then 'player' else 'opponent' end,
       case when (i * 7) % 10 < 6 then 'player' else 'opponent' end,
       case when i % 3 = 0 then 2 else 1 end,
       case when i % 2 = 0 then 'deuce' else 'ad' end,
       (array['wide', 'body', 't'])[1 + i % 3],
       (i * 5) % 13,
       (array['winner', 'unforced_error', 'forced_error', 'winner', 'ace', 'unforced_error', 'double_fault'])[1 + i % 7],
       (array['forehand', 'backhand', 'volley', 'forehand', 'serve', 'backhand', 'serve'])[1 + i % 7],
       ((i * 37) % 100) / 100.0, ((i * 53) % 100) / 100.0
from generate_series(1, 120) i;
select public.compute_match_stats('a0000000-0000-0000-0000-000000000001');
update public.matches set
  ai_takeaway = 'Backhand errors cluster after the fourth ball; shorten the take-back when pushed wide.',
  ai_summary = 'You won the long rallies but leaked points on the backhand once rallies passed four shots.',
  tactical_adjustments = '["Serve body on the ad side to jam the return","Use the slice backhand to reset when pulled wide"]',
  analysed_at = now()
where id = 'a0000000-0000-0000-0000-000000000001';

insert into public.playstyle_snapshots (player_id, equipment, tactical, primary_style, rationale) values
  ('11111111-1111-1111-1111-111111111111', '{"power":38,"control":34,"spin":28}',
   '{"aggressive_baseliner":30,"defensive_baseliner":18,"all_court":40,"serve_and_volley":12}', 'all_court',
   'Balanced frame and frequent net approaches.');

insert into public.drills (id, player_id, source, title, description, stroke, difficulty, target) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ai', 'Cross-court backhand ladder', 'Ten in a row past the service line.', 'backhand', 3, '{"reps":10,"accuracy_pct":70}'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'ai', 'Serve + first ball pattern', 'Serve wide, forehand to the open court.', 'serve', 2, '{"reps":20,"accuracy_pct":60}');
insert into public.drill_logs (drill_id, player_id, logged_at, accuracy_pct, consistency_pct, reps)
select 'd0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', now() - (i || ' days')::interval, 55 + i * 2, 60 + i, 10
from generate_series(1, 6) i;

insert into public.checklist_items (player_id, kind, title, drill_id, done_at, position) values
  ('11111111-1111-1111-1111-111111111111', 'custom', '10 min dynamic warm-up', null, now(), 0),
  ('11111111-1111-1111-1111-111111111111', 'drill', 'Cross-court backhand ladder', 'd0000000-0000-0000-0000-000000000001', null, 1),
  ('11111111-1111-1111-1111-111111111111', 'drill', 'Serve + first ball pattern', 'd0000000-0000-0000-0000-000000000002', null, 2);

insert into public.wearable_connections (player_id, provider, last_synced_at) values
  ('11111111-1111-1111-1111-111111111111', 'apple_watch', now() - interval '6 minutes'),
  ('11111111-1111-1111-1111-111111111111', 'whoop', now() - interval '6 minutes');
insert into public.wearable_sessions (player_id, provider, external_id, started_at, duration_s, calories, distance_m, avg_hr, max_hr, hr_zones, recovery_score)
select '11111111-1111-1111-1111-111111111111', 'apple_watch', 'seed-' || i, now() - (i || ' days')::interval, 5400, 620 + i * 10, 4200 + i * 100,
       138, 171, '{"z1_s":600,"z2_s":1500,"z3_s":1900,"z4_s":1100,"z5_s":300}', 70 - i
from generate_series(1, 5) i;

insert into public.swing_analyses (player_id, source, stroke, video_path, status, checkpoints, summary, key_finding, overall_score, recommended_drill_id) values
  ('11111111-1111-1111-1111-111111111111', 'upload', 'backhand', '11111111-1111-1111-1111-111111111111/seed-backhand.mp4', 'succeeded',
   '[{"key":"unit_turn","label":"Unit turn","score":82,"status":"good"},{"key":"contact_point","label":"Contact point","score":61,"status":"work_on","note":"Contact is late, behind the front hip."},{"key":"finish","label":"Finish","score":77,"status":"good"}]',
   'Solid preparation; contact drifts late under pace.', 'Contact point is late: meet the ball a racket-head in front of the front hip.', 73,
   'd0000000-0000-0000-0000-000000000001');

insert into public.pathway_stages (position, level, title, description, lessons) values
  (1, 'foundations', 'Grip fundamentals', 'Continental, eastern and semi-western grips.', '[{"key":"continental","title":"The continental grip","kind":"video"},{"key":"forehand-grips","title":"Forehand grips","kind":"read"}]'),
  (2, 'foundations', 'Scoring & etiquette', 'Love, deuce, tiebreaks and calling the lines.', '[{"key":"scoring","title":"How scoring works","kind":"read"},{"key":"etiquette","title":"Court etiquette","kind":"read"}]'),
  (3, 'developing', 'Rally consistency', 'Ten-ball rallies from the baseline.', '[{"key":"rally-10","title":"Ten-ball rally","kind":"drill"}]'),
  (4, 'intermediate', 'Serve mechanics', 'Trophy pose, pronation and toss.', '[{"key":"trophy","title":"The trophy pose","kind":"video"},{"key":"toss","title":"A repeatable toss","kind":"drill"}]');

-- Content -------------------------------------------------------------------
insert into public.articles (slug, author_id, title, dek, category, body_md, header_art, read_minutes, featured, status, published_at) values
  ('elegance-is-efficiency', '22222222-2222-2222-2222-222222222222', 'Elegance is efficiency.', 'What the one-handed backhand teaches us about preparation, timing, and playing without excess.', 'TECHNIQUE', '# Elegance is efficiency\n\nPreparation is the whole stroke.', 'racket', 12, true, 'published', now() - interval '1 day'),
  ('quiet-architecture', null, 'The quiet architecture of a match', 'Managing space, time and uncertainty.', 'MENTAL GAME', 'Every point begins as an arrangement of possibilities.', 'court', 8, false, 'published', now() - interval '3 days'),
  ('why-tension-changes-everything', null, 'Why tension changes everything', 'Two pounds, a different racket.', 'EQUIPMENT', 'Lower tension, more power; higher, more control.', 'strings', 6, false, 'published', now() - interval '5 days'),
  ('finish-at-the-net', '33333333-3333-3333-3333-333333333333', 'Learning to finish at the net', 'Approach, split, volley, close.', 'TACTICS', 'Use height and depth to create the shorter ball.', 'volley', 11, false, 'published', now() - interval '7 days');

insert into public.saved_folders (id, user_id, name) values
  ('5f000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Serve mechanics'),
  ('5f000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Footwork'),
  ('5f000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Match tactics'),
  ('5f000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Equipment');
insert into public.saved_items (user_id, folder_id, kind, ref_id)
select '11111111-1111-1111-1111-111111111111', '5f000000-0000-0000-0000-000000000003', 'article', id from public.articles where slug = 'finish-at-the-net';

-- Gear ----------------------------------------------------------------------
insert into public.wardrobe_items (player_id, kind, brand, model, primary_item, head_size_sq_in, weight_g, grip_size, string_name, tension_main_lbs, tension_cross_lbs, strung_at, hours_since_restring, image_path) values
  ('11111111-1111-1111-1111-111111111111', 'racket', 'Babolat', 'Pure Drive', true, 100, 300, '4 3/8', 'RPM Blast 17', 52, 50, current_date - 24, 27.5, 'seed/babolat-pure-drive.jpg');
insert into public.wardrobe_items (player_id, kind, brand, model, size, surface) values
  ('11111111-1111-1111-1111-111111111111', 'shoes', 'Asics', 'Gel-Resolution 9', '10.5', 'hard');

insert into public.products (category, brand, model, year, msrp_cents, specs, profile, rating, review_count) values
  ('racket', 'Babolat', 'Pure Aero', 2023, 27900, '{"head_size":100,"weight_g":300,"pattern":"16x19","stiffness_ra":67}', '{"power":78,"control":62,"spin":92,"comfort":55}', 4.6, 812),
  ('racket', 'Babolat', 'Pure Drive', 2025, 27900, '{"head_size":100,"weight_g":300,"pattern":"16x19","stiffness_ra":71}', '{"power":90,"control":64,"spin":75,"comfort":50}', 4.5, 1204),
  ('racket', 'Wilson', 'Pro Staff 97', 2023, 26900, '{"head_size":97,"weight_g":315,"pattern":"16x19","stiffness_ra":66}', '{"power":60,"control":90,"spin":66,"comfort":70}', 4.7, 640),
  ('racket', 'Yonex', 'EZONE 100', 2025, 27900, '{"head_size":100,"weight_g":300,"pattern":"16x19","stiffness_ra":68}', '{"power":84,"control":70,"spin":74,"comfort":72}', 4.6, 530),
  ('racket', 'Head', 'Speed MP', 2024, 26900, '{"head_size":100,"weight_g":300,"pattern":"16x19","stiffness_ra":64}', '{"power":72,"control":78,"spin":72,"comfort":74}', 4.5, 470),
  ('strings', 'Babolat', 'RPM Blast 17', null, 1899, '{"gauge":"17","material":"co-poly"}', '{"power":40,"control":85,"spin":90,"comfort":35}', 4.6, 2100);

-- Invoices / payments ---------------------------------------------------------
insert into public.invoices (student_id, payee_coach_id, kind, ref_id, description, amount_cents, category, due_at) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'lesson', gen_random_uuid(), 'Private lesson · Elena Moretti', 9500, 'coaching', now() + interval '3 days');
insert into public.payments (user_id, description, category, amount_cents, status, card_brand, card_last4, paid_at)
select '11111111-1111-1111-1111-111111111111', d, c::public.spend_category, a, 'succeeded', 'visa', '4242', now() - (i || ' days')::interval
from (values (1, 'Private lesson · Elena Moretti', 'coaching', 9500), (9, 'Court rental · Prospect Park', 'court_time', 2800),
             (20, 'Cardio tennis', 'coaching', 3200), (35, 'Court rental · Fort Greene', 'court_time', 3200)) v(i, d, c, a);
insert into public.gear_expenses (user_id, description, amount_cents, spent_at) values
  ('11111111-1111-1111-1111-111111111111', 'Restring · RPM Blast', 3600, current_date - 24);
