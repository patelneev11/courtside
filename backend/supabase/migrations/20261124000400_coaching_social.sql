-- Coach tab: classes, lesson availability & bookings, chat.

create type public.class_kind as enum ('clinic', 'cardio', 'workshop', 'match_play');
create type public.lesson_kind as enum ('private', 'semi_private');
create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled', 'completed');

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('public_park', 'partner_club')),
  address text not null default '',
  city text not null default '',
  lat double precision,
  lng double precision,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null,
  surface public.court_surface not null,
  indoor boolean not null default false,
  lights boolean not null default false,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  active boolean not null default true
);

alter table public.profiles
  add constraint profiles_home_court_fk foreign key (home_court_id) references public.courts (id) on delete set null;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  title text not null,
  kind public.class_kind not null,
  description text not null default '',
  level_min numeric(2, 1) not null default 1.0,
  level_max numeric(2, 1) not null default 7.0,
  court_id uuid references public.courts (id) on delete set null,
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min > 0),
  capacity integer not null check (capacity > 0),
  price_cents integer not null check (price_cents >= 0),
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (level_min <= level_max)
);
create index on public.classes (starts_at) where not cancelled;

create table public.class_enrollments (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.booking_status not null default 'pending_payment',
  invoice_id uuid,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create view public.class_directory with (security_invoker = true) as
  select c.*,
    c.capacity - (select count(*) from public.class_enrollments e where e.class_id = c.id and e.status <> 'cancelled') as spots_left
  from public.classes c
  where not c.cancelled;

create table public.coach_availability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kinds public.lesson_kind[] not null default '{private,semi_private}',
  court_id uuid references public.courts (id) on delete set null,
  booked boolean not null default false,
  check (ends_at > starts_at)
);
create index on public.coach_availability (coach_id, starts_at) where not booked;

create table public.lesson_packages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  title text not null,
  lesson_count integer not null check (lesson_count > 0),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true
);

create table public.lesson_credits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  package_id uuid references public.lesson_packages (id) on delete set null,
  remaining integer not null check (remaining >= 0),
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  availability_id uuid unique references public.coach_availability (id) on delete set null,
  kind public.lesson_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  court_id uuid references public.courts (id) on delete set null,
  price_cents integer not null check (price_cents >= 0),
  status public.booking_status not null default 'pending_payment',
  invoice_id uuid,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.lessons (student_id, starts_at);
create index on public.lessons (coach_id, starts_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.coaches (profile_id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, coach_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  swing_analysis_id uuid references public.swing_analyses (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(body) > 0 or swing_analysis_id is not null)
);
create index on public.messages (conversation_id, created_at);

create or replace function public.is_conversation_member(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = conv
                 and (select auth.uid()) in (c.student_id, c.coach_id));
$$;

create or replace function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  conv public.conversations;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id returning * into conv;
  insert into public.notifications (user_id, kind, title, body, payload)
  values (case when new.sender_id = conv.student_id then conv.coach_id else conv.student_id end,
          'message', 'New message', left(new.body, 140), jsonb_build_object('conversation_id', conv.id));
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_insert();

-- Notify followers when a coach opens a class.
create or replace function public.on_class_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, payload)
  select f.student_id, 'coach_new_class', 'New class spots', new.title,
         jsonb_build_object('class_id', new.id, 'coach_id', new.coach_id)
  from public.follows f where f.coach_id = new.coach_id;
  return new;
end $$;
create trigger classes_after_insert after insert on public.classes
  for each row execute function public.on_class_insert();

alter table public.facilities enable row level security;
alter table public.courts enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.coach_availability enable row level security;
alter table public.lesson_packages enable row level security;
alter table public.lesson_credits enable row level security;
alter table public.lessons enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "facilities are public" on public.facilities for select to anon, authenticated using (true);
create policy "courts are public" on public.courts for select to anon, authenticated using (true);

create policy "classes are public" on public.classes for select to anon, authenticated using (true);
create policy "coaches manage their classes" on public.classes for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

create policy "students and class coach see enrollments" on public.class_enrollments for select to authenticated
  using (student_id = (select auth.uid()) or exists (select 1 from public.classes c where c.id = class_id and c.coach_id = (select auth.uid())));

create policy "availability is public" on public.coach_availability for select to anon, authenticated using (true);
create policy "coaches manage availability" on public.coach_availability for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

create policy "packages are public" on public.lesson_packages for select to anon, authenticated using (active or coach_id = (select auth.uid()));
create policy "coaches manage packages" on public.lesson_packages for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

create policy "students and coaches see credits" on public.lesson_credits for select to authenticated
  using (student_id = (select auth.uid()) or coach_id = (select auth.uid()));

create policy "participants see lessons" on public.lessons for select to authenticated
  using (student_id = (select auth.uid()) or coach_id = (select auth.uid()));
create policy "coaches add lesson notes" on public.lessons for update to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

create policy "members see conversations" on public.conversations for select to authenticated
  using ((select auth.uid()) in (student_id, coach_id));
create policy "students open conversations" on public.conversations for insert to authenticated
  with check (student_id = (select auth.uid()));

create policy "members read messages" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "members send messages" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id)
    and (swing_analysis_id is null or exists (
      select 1 from public.swing_analyses s where s.id = swing_analysis_id and s.player_id = (select auth.uid()))));
create policy "recipients mark messages read" on public.messages for update to authenticated
  using (public.is_conversation_member(conversation_id) and sender_id <> (select auth.uid()))
  with check (public.is_conversation_member(conversation_id));

alter publication supabase_realtime add table public.messages;
