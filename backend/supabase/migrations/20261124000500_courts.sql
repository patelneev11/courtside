-- Book tab: court slots, reservations, favourites, availability alerts.

create type public.slot_status as enum ('open', 'held', 'booked', 'closed');

create table public.court_slots (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.slot_status not null default 'open',
  held_until timestamptz,
  external_ref text,  -- id in a partner club's booking system
  check (ends_at > starts_at),
  unique (court_id, starts_at)
);
create index on public.court_slots (starts_at) where status = 'open';

create table public.court_reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.court_slots (id) on delete restrict,
  player_id uuid not null references public.profiles (id) on delete cascade,
  status public.booking_status not null default 'pending_payment',
  price_cents integer not null check (price_cents >= 0),
  invoice_id uuid,
  created_at timestamptz not null default now()
);
create unique index court_reservations_active_slot on public.court_reservations (slot_id) where status <> 'cancelled';

create table public.favorite_courts (
  player_id uuid not null references public.profiles (id) on delete cascade,
  court_id uuid not null references public.courts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, court_id)
);

create table public.court_alerts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  facility_id uuid references public.facilities (id) on delete cascade,
  court_id uuid references public.courts (id) on delete cascade,
  label text not null default '',
  days smallint[] not null default '{0,1,2,3,4,5,6}',  -- 0 = Sunday, local to facility
  start_time time not null default '17:00',
  end_time time not null default '21:00',
  surfaces public.court_surface[],
  auto_hold boolean not null default false,  -- hold the slot for 10 min when it opens
  active boolean not null default true,
  last_notified_slot uuid references public.court_slots (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (facility_id is not null or court_id is not null)
);

-- Availability tracker: one timeline across favourites (or any facility).
create view public.court_availability with (security_invoker = true) as
  select s.id as slot_id, s.starts_at, s.ends_at, s.status,
         c.id as court_id, c.name as court_name, c.surface, c.indoor, c.lights, c.hourly_rate_cents,
         f.id as facility_id, f.name as facility_name, f.kind as facility_kind, f.timezone,
         extract(dow from s.starts_at at time zone f.timezone)::smallint as local_dow,
         (s.starts_at at time zone f.timezone)::time as local_start,
         (extract(dow from s.starts_at at time zone f.timezone) in (0, 6)
           or (s.starts_at at time zone f.timezone)::time >= '17:00') as prime_time,
         exists (select 1 from public.favorite_courts fc where fc.court_id = c.id and fc.player_id = (select auth.uid())) as favorite
  from public.court_slots s
  join public.courts c on c.id = s.court_id and c.active
  join public.facilities f on f.id = c.facility_id;

alter table public.court_slots enable row level security;
alter table public.court_reservations enable row level security;
alter table public.favorite_courts enable row level security;
alter table public.court_alerts enable row level security;

create policy "slots are public" on public.court_slots for select to anon, authenticated using (true);
create policy "players see their reservations" on public.court_reservations for select to authenticated using (player_id = (select auth.uid()));
create policy "players manage favourites" on public.favorite_courts for all to authenticated
  using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));
create policy "players manage alerts" on public.court_alerts for all to authenticated
  using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));

alter publication supabase_realtime add table public.court_slots;
