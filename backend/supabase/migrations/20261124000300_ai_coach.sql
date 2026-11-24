-- Agent jobs (start -> steps -> result), AI Coach findings, line calling, Beginner Hub pathway.

create type public.agent_job_kind as enum (
  'match_analysis', 'playstyle', 'workout', 'drills', 'swing_analysis',
  'racket_recommendation', 'deal_search', 'training_load'
);
create type public.agent_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');

create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.agent_job_kind not null,
  status public.agent_job_status not null default 'queued',
  steps jsonb not null default '[]',     -- [{key, label, status:'pending'|'running'|'done'|'failed', at}]
  current_step smallint not null default 0,
  input jsonb not null default '{}',
  result jsonb,
  error text,
  model text,
  usage jsonb,                            -- {input_tokens, output_tokens}
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.agent_jobs (user_id, created_at desc);
create trigger agent_jobs_updated_at before update on public.agent_jobs
  for each row execute function public.set_updated_at();

create type public.swing_source as enum ('upload', 'live');
create type public.stroke_type as enum ('serve', 'forehand', 'backhand', 'volley', 'overhead', 'return', 'rally');

create table public.swing_analyses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  agent_job_id uuid references public.agent_jobs (id) on delete set null,
  source public.swing_source not null,
  stroke public.stroke_type not null default 'rally',
  video_path text not null,
  trim_start_ms integer check (trim_start_ms >= 0),
  trim_end_ms integer check (trim_end_ms is null or trim_end_ms > coalesce(trim_start_ms, 0)),
  status public.agent_job_status not null default 'queued',
  -- [{key:'contact_point'|'trophy_pose'|..., label, score:0-100, status:'good'|'work_on', note, frame_ms}]
  checkpoints jsonb not null default '[]',
  -- [{frame_ms, image_path, annotations:[{type:'line'|'angle'|'point', ...}]}]
  annotated_frames jsonb not null default '[]',
  pose_metrics jsonb not null default '{}',  -- raw computer-vision output (joint angles, timings)
  summary text,
  key_finding text,
  overall_score smallint check (overall_score between 0 and 100),
  recommended_drill_id uuid references public.drills (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.swing_analyses (player_id, created_at desc);

create table public.line_call_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  surface public.court_surface,
  -- [{t_ms, x, y, call:'in'|'out', confidence}]
  calls jsonb not null default '[]',
  in_count integer generated always as (jsonb_array_length(jsonb_path_query_array(calls, '$[*] ? (@.call == "in")'))) stored,
  out_count integer generated always as (jsonb_array_length(jsonb_path_query_array(calls, '$[*] ? (@.call == "out")'))) stored,
  video_path text
);
create index on public.line_call_sessions (player_id, started_at desc);

create table public.pathway_stages (
  id uuid primary key default gen_random_uuid(),
  position smallint not null unique,
  level text not null check (level in ('foundations', 'developing', 'intermediate')),
  title text not null,
  description text not null default '',
  lessons jsonb not null default '[]'  -- [{key, title, kind:'read'|'video'|'drill'}]
);

create table public.pathway_progress (
  player_id uuid not null references public.profiles (id) on delete cascade,
  stage_id uuid not null references public.pathway_stages (id) on delete cascade,
  completed_lessons text[] not null default '{}',
  completed_at timestamptz,
  primary key (player_id, stage_id)
);

-- Stage is unlocked when all earlier stages are complete.
create or replace function public.complete_pathway_lesson(p_stage uuid, p_lesson text)
returns public.pathway_progress
language plpgsql security invoker set search_path = '' as $$
declare
  st public.pathway_stages;
  pr public.pathway_progress;
  blocked boolean;
begin
  select * into st from public.pathway_stages where id = p_stage;
  if not found then raise exception 'unknown stage'; end if;
  if not exists (select 1 from jsonb_array_elements(st.lessons) l where l ->> 'key' = p_lesson) then
    raise exception 'unknown lesson %', p_lesson;
  end if;
  select exists (
    select 1 from public.pathway_stages s
    left join public.pathway_progress p on p.stage_id = s.id and p.player_id = (select auth.uid())
    where s.position < st.position and p.completed_at is null
  ) into blocked;
  if blocked then raise exception 'stage is locked'; end if;

  insert into public.pathway_progress (player_id, stage_id, completed_lessons)
  values ((select auth.uid()), p_stage, array[p_lesson])
  on conflict (player_id, stage_id) do update
    set completed_lessons = (select array_agg(distinct x) from unnest(public.pathway_progress.completed_lessons || p_lesson) x)
  returning * into pr;

  if (select count(*) from jsonb_array_elements(st.lessons)) <= cardinality(pr.completed_lessons) and pr.completed_at is null then
    update public.pathway_progress set completed_at = now()
    where player_id = pr.player_id and stage_id = pr.stage_id returning * into pr;
  end if;
  return pr;
end $$;

alter table public.agent_jobs enable row level security;
alter table public.swing_analyses enable row level security;
alter table public.line_call_sessions enable row level security;
alter table public.pathway_stages enable row level security;
alter table public.pathway_progress enable row level security;

-- Jobs are created/updated only by edge functions (service role); users watch them via select + realtime.
create policy "users watch their agent jobs" on public.agent_jobs for select to authenticated using (user_id = (select auth.uid()));

create policy "read own or coached swing analyses" on public.swing_analyses for select to authenticated using (public.can_view_player(player_id));
create policy "players delete own swing analyses" on public.swing_analyses for delete to authenticated using (player_id = (select auth.uid()));

create policy "players own line-call sessions" on public.line_call_sessions for all to authenticated
  using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));
create policy "coaches read students' line-call sessions" on public.line_call_sessions for select to authenticated
  using (public.can_view_player(player_id));

create policy "pathway is public" on public.pathway_stages for select to anon, authenticated using (true);
create policy "players read own pathway progress" on public.pathway_progress for select to authenticated using (public.can_view_player(player_id));

alter publication supabase_realtime add table public.agent_jobs;
