-- Stats & Train: matches, playstyle, workouts, drills, checklist, wearables.

create type public.court_surface as enum ('hard', 'clay', 'grass');
create type public.match_source as enum ('manual', 'video', 'line_calling');
create type public.content_source as enum ('ai', 'coach', 'self');
create type public.wearable_provider as enum ('apple_watch', 'garmin', 'whoop', 'oura');
create type public.connection_status as enum ('connected', 'disconnected', 'error');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  opponent_name text not null default '',
  played_at timestamptz not null default now(),
  surface public.court_surface,
  kind text not null default 'match' check (kind in ('match', 'practice_set')),
  score text not null default '',
  result text check (result in ('win', 'loss', 'unfinished')),
  source public.match_source not null default 'manual',
  video_path text,
  -- Raw, exact numbers (from manual logging or computer vision). Never produced by the LLM.
  stats jsonb not null default '{}',          -- {first_serve_pct, aces, double_faults, winners, unforced_errors, ...}
  serve_zones jsonb not null default '[]',    -- [{side:'deuce'|'ad', zone:'wide'|'body'|'t', attempts, won}]
  rally_lengths jsonb not null default '[]',  -- [{bucket:'0-4', points, won}]
  momentum jsonb not null default '[]',       -- [{point, diff}]
  error_patterns jsonb not null default '[]', -- [{stroke, type, count}]
  heatmap jsonb not null default '[]',        -- [{x, y, weight}] normalised 0..1 court coords
  -- AI layer (Claude), written by the agent from the numbers above.
  ai_summary text,
  ai_takeaway text,
  tactical_adjustments jsonb not null default '[]',
  analysed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.matches (player_id, played_at desc);

-- Manual point-by-point logging; aggregated into matches.stats by compute_match_stats().
create table public.match_points (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  seq integer not null,
  server text not null check (server in ('player', 'opponent')),
  winner text not null check (winner in ('player', 'opponent')),
  serve_number smallint check (serve_number in (1, 2)),
  serve_side text check (serve_side in ('deuce', 'ad')),
  serve_zone text check (serve_zone in ('wide', 'body', 't')),
  rally_length integer not null default 0 check (rally_length >= 0),
  ending text not null check (ending in ('ace', 'double_fault', 'winner', 'unforced_error', 'forced_error')),
  ending_stroke text check (ending_stroke in ('serve', 'return', 'forehand', 'backhand', 'volley', 'overhead', 'drop_shot', 'lob')),
  bounce_x real check (bounce_x between 0 and 1),
  bounce_y real check (bounce_y between 0 and 1),
  unique (match_id, seq)
);

create table public.playstyle_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  equipment jsonb not null,  -- {power, control, spin} summing to 100
  tactical jsonb not null,   -- {aggressive_baseliner, defensive_baseliner, all_court, serve_and_volley} summing to 100
  primary_style public.tactical_style not null,
  rationale text,
  source public.content_source not null default 'ai',
  computed_at timestamptz not null default now()
);
create index on public.playstyle_snapshots (player_id, computed_at desc);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  focus text not null default '',
  source public.content_source not null default 'ai',
  created_by uuid references public.profiles (id) on delete set null,
  params jsonb not null default '{}',  -- inputs given to the generator
  plan jsonb not null default '[]',    -- [{block, exercises:[{name, sets, reps, rest_s, cue}]}]
  duration_min integer,
  intensity text check (intensity in ('low', 'moderate', 'high')),
  scheduled_for timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.workouts (player_id, scheduled_for);

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  source public.content_source not null default 'ai',
  title text not null,
  description text not null default '',
  stroke text,
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  target jsonb not null default '{}',  -- {reps, accuracy_pct, zone}
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.drills (player_id) where active;

create table public.drill_logs (
  id uuid primary key default gen_random_uuid(),
  drill_id uuid not null references public.drills (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  logged_at timestamptz not null default now(),
  accuracy_pct smallint check (accuracy_pct between 0 and 100),
  consistency_pct smallint check (consistency_pct between 0 and 100),
  reps integer,
  notes text
);
create index on public.drill_logs (drill_id, logged_at desc);

-- Home "Remaining Workouts / Drills" checklist.
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  for_date date not null default current_date,
  kind text not null check (kind in ('workout', 'drill', 'custom')),
  workout_id uuid references public.workouts (id) on delete cascade,
  drill_id uuid references public.drills (id) on delete cascade,
  title text not null,
  done_at timestamptz,
  position smallint not null default 0
);
create index on public.checklist_items (player_id, for_date);

create table public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  provider public.wearable_provider not null,
  status public.connection_status not null default 'connected',
  external_user_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_id, provider)
);

-- OAuth tokens: service-role only (RLS on, no policies).
create table public.wearable_tokens (
  connection_id uuid primary key references public.wearable_connections (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz
);

create table public.wearable_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  provider public.wearable_provider not null,
  external_id text,
  started_at timestamptz not null,
  duration_s integer not null check (duration_s >= 0),
  calories integer,
  distance_m integer,
  avg_hr smallint,
  max_hr smallint,
  hr_zones jsonb not null default '{}',  -- {z1_s, z2_s, z3_s, z4_s, z5_s}
  recovery_score smallint check (recovery_score between 0 and 100),
  strain real,
  match_id uuid references public.matches (id) on delete set null,
  unique (player_id, provider, external_id)
);
create index on public.wearable_sessions (player_id, started_at desc);

-- Exact aggregation of logged points into the chart fields.
create or replace function public.compute_match_stats(p_match uuid) returns public.matches
language plpgsql security invoker set search_path = '' as $$
declare
  m public.matches;
begin
  update public.matches mt set
    stats = s.stats,
    serve_zones = s.serve_zones,
    rally_lengths = s.rally_lengths,
    momentum = s.momentum,
    error_patterns = s.error_patterns,
    heatmap = s.heatmap
  from (
    select
      jsonb_build_object(
        'points_played', count(*),
        'points_won', count(*) filter (where winner = 'player'),
        'first_serve_pct', round(100.0 * count(*) filter (where server = 'player' and serve_number = 1)
                             / nullif(count(*) filter (where server = 'player'), 0)),
        'first_serve_won_pct', round(100.0 * count(*) filter (where server = 'player' and serve_number = 1 and winner = 'player')
                             / nullif(count(*) filter (where server = 'player' and serve_number = 1), 0)),
        'aces', count(*) filter (where server = 'player' and ending = 'ace'),
        'double_faults', count(*) filter (where server = 'player' and ending = 'double_fault'),
        'winners', count(*) filter (where winner = 'player' and ending in ('winner', 'ace')),
        'unforced_errors', count(*) filter (where winner = 'opponent' and ending in ('unforced_error', 'double_fault')),
        'winner_error_ratio', round((count(*) filter (where winner = 'player' and ending in ('winner', 'ace')))::numeric
                             / nullif(count(*) filter (where winner = 'opponent' and ending in ('unforced_error', 'double_fault')), 0), 2),
        'avg_rally', round(avg(rally_length), 1)
      ) as stats,
      coalesce((select jsonb_agg(jsonb_build_object('side', side, 'zone', zone, 'attempts', n, 'won', w) order by side, zone)
        from (select serve_side side, serve_zone zone, count(*) n, count(*) filter (where winner = 'player') w
              from public.match_points where match_id = p_match and server = 'player' and serve_zone is not null
              group by 1, 2) z), '[]') as serve_zones,
      coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'points', n, 'won', w) order by ord)
        from (select case when rally_length <= 4 then '0-4' when rally_length <= 8 then '5-8' else '9+' end bucket,
                     min(case when rally_length <= 4 then 0 when rally_length <= 8 then 1 else 2 end) ord,
                     count(*) n, count(*) filter (where winner = 'player') w
              from public.match_points where match_id = p_match group by 1) r), '[]') as rally_lengths,
      coalesce((select jsonb_agg(jsonb_build_object('point', seq, 'diff', diff) order by seq)
        from (select seq, sum(case when winner = 'player' then 1 else -1 end) over (order by seq) diff
              from public.match_points where match_id = p_match) mo), '[]') as momentum,
      coalesce((select jsonb_agg(jsonb_build_object('stroke', stroke, 'type', ending, 'count', n) order by n desc)
        from (select ending_stroke stroke, ending, count(*) n from public.match_points
              where match_id = p_match and winner = 'opponent' and ending in ('unforced_error', 'forced_error', 'double_fault')
              group by 1, 2) e), '[]') as error_patterns,
      coalesce((select jsonb_agg(jsonb_build_object('x', bounce_x, 'y', bounce_y, 'weight', 1))
        from public.match_points where match_id = p_match and bounce_x is not null), '[]') as heatmap
    from public.match_points where match_id = p_match
  ) s
  where mt.id = p_match
  returning mt.* into m;
  return m;
end $$;

-- RLS -----------------------------------------------------------------------

alter table public.matches enable row level security;
alter table public.match_points enable row level security;
alter table public.playstyle_snapshots enable row level security;
alter table public.workouts enable row level security;
alter table public.drills enable row level security;
alter table public.drill_logs enable row level security;
alter table public.checklist_items enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.wearable_tokens enable row level security;
alter table public.wearable_sessions enable row level security;

create policy "read own or coached matches" on public.matches for select to authenticated using (public.can_view_player(player_id));
create policy "log own matches" on public.matches for insert to authenticated with check (player_id = (select auth.uid()) and ai_summary is null);
create policy "edit own matches" on public.matches for update to authenticated using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));
create policy "delete own matches" on public.matches for delete to authenticated using (player_id = (select auth.uid()));

create policy "read points of visible matches" on public.match_points for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and public.can_view_player(m.player_id)));
create policy "write points of own matches" on public.match_points for all to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.player_id = (select auth.uid())))
  with check (exists (select 1 from public.matches m where m.id = match_id and m.player_id = (select auth.uid())));

create policy "read own or coached playstyle" on public.playstyle_snapshots for select to authenticated using (public.can_view_player(player_id));

create policy "read own or coached workouts" on public.workouts for select to authenticated using (public.can_view_player(player_id));
create policy "players and their coaches add workouts" on public.workouts for insert to authenticated
  with check (public.can_view_player(player_id) and (player_id = (select auth.uid()) or source = 'coach'));
create policy "players update own workouts" on public.workouts for update to authenticated
  using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));
create policy "players delete own workouts" on public.workouts for delete to authenticated using (player_id = (select auth.uid()));

create policy "read own or coached drills" on public.drills for select to authenticated using (public.can_view_player(player_id));
create policy "players and their coaches add drills" on public.drills for insert to authenticated
  with check (public.can_view_player(player_id) and (player_id = (select auth.uid()) or (source = 'coach' and assigned_by = (select auth.uid()))));
create policy "players and assigning coaches edit drills" on public.drills for update to authenticated
  using (player_id = (select auth.uid()) or assigned_by = (select auth.uid()))
  with check (public.can_view_player(player_id));

create policy "read own or coached drill logs" on public.drill_logs for select to authenticated using (public.can_view_player(player_id));
create policy "players log their drills" on public.drill_logs for insert to authenticated
  with check (player_id = (select auth.uid()) and exists (select 1 from public.drills d where d.id = drill_id and d.player_id = (select auth.uid())));

create policy "players own their checklist" on public.checklist_items for all to authenticated
  using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));

create policy "players see their wearables" on public.wearable_connections for select to authenticated using (player_id = (select auth.uid()));
create policy "players disconnect wearables" on public.wearable_connections for delete to authenticated using (player_id = (select auth.uid()));

create policy "read own or coached wearable sessions" on public.wearable_sessions for select to authenticated using (public.can_view_player(player_id));
