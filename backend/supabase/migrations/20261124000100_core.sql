-- Core identity: profiles, coaches, follows, relationships, helpers.

create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'coach', 'admin');
create type public.dominant_hand as enum ('right', 'left');
create type public.backhand_style as enum ('one_handed', 'two_handed');
create type public.tactical_style as enum ('aggressive_baseliner', 'defensive_baseliner', 'all_court', 'serve_and_volley');
create type public.theme_mode as enum ('light', 'dark', 'system');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null default '',
  avatar_path text,
  ntrp numeric(2, 1) check (ntrp between 1.0 and 7.0),
  utr numeric(4, 2) check (utr between 1 and 16.5),
  dominant_hand public.dominant_hand,
  backhand_style public.backhand_style,
  primary_playstyle public.tactical_style,
  home_court_id uuid,
  theme public.theme_mode not null default 'system',
  settings jsonb not null default '{
    "notifications": {"lessons": true, "court_alerts": true, "coach_posts": true, "payments": true},
    "wearable_permissions": {"heart_rate": true, "calories": true, "distance": true, "recovery": true},
    "upload_quality": "high",
    "privacy": {"profile_public": true, "share_stats_with_coaches": true}
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coaches (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  headline text not null default '',
  bio text not null default '',
  philosophy text not null default '',
  credentials text[] not null default '{}',
  specialties text[] not null default '{}',
  hourly_rate_cents integer not null default 0 check (hourly_rate_cents >= 0),
  semi_private_rate_cents integer check (semi_private_rate_cents >= 0),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Stripe identifiers are server-only; clients never read this table.
create table public.billing_accounts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_connect_account_id text unique,
  connect_charges_enabled boolean not null default false,
  connect_payouts_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.follows (
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, coach_id),
  check (student_id <> coach_id)
);

-- A coach "has" a student once a lesson/class/assignment links them; grants read access to training data.
create table public.coach_students (
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, student_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- Helpers -------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coaches where profile_id = (select auth.uid()));
$$;

-- True when the caller may read this player's training data: themselves, or a coach linked to them
-- who has not been blocked by the student's privacy setting.
create or replace function public.can_view_player(player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select player = (select auth.uid())
    or exists (
      select 1
      from public.coach_students cs
      join public.profiles p on p.id = cs.student_id
      where cs.coach_id = (select auth.uid())
        and cs.student_id = player
        and coalesce((p.settings -> 'privacy' ->> 'share_stats_with_coaches')::boolean, true)
    );
$$;

-- Prevent clients from escalating their own role.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.role is distinct from old.role and not public.is_admin()
     and coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'role can only be changed by an admin';
  end if;
  return new;
end $$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, avatar_path)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_path'
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS -----------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.coaches enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.follows enable row level security;
alter table public.coach_students enable row level security;
alter table public.notifications enable row level security;

create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "coach directory is public" on public.coaches
  for select to anon, authenticated using (true);
create policy "coaches edit their own card" on public.coaches
  for update to authenticated using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and verified = (select c.verified from public.coaches c where c.profile_id = (select auth.uid())));

create policy "students see their follows; coaches see followers" on public.follows
  for select to authenticated using (student_id = (select auth.uid()) or coach_id = (select auth.uid()));
create policy "students follow coaches" on public.follows
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "students unfollow coaches" on public.follows
  for delete to authenticated using (student_id = (select auth.uid()));

create policy "both sides see the coaching link" on public.coach_students
  for select to authenticated using (student_id = (select auth.uid()) or coach_id = (select auth.uid()));

create policy "users read their notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users mark notifications read" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
