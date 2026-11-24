-- Payments (Stripe; coaches paid via Connect), calendar, spending.

create type public.invoice_kind as enum ('lesson', 'class', 'court', 'package');
create type public.invoice_status as enum ('open', 'processing', 'paid', 'void', 'refunded');
create type public.spend_category as enum ('coaching', 'court_time', 'gear');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  payee_coach_id uuid references public.coaches (profile_id) on delete set null,  -- null = platform/facility
  kind public.invoice_kind not null,
  ref_id uuid not null,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  category public.spend_category not null,
  due_at timestamptz not null default now() + interval '7 days',
  status public.invoice_status not null default 'open',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now()
);
create index on public.invoices (student_id, status);

alter table public.lessons add constraint lessons_invoice_fk foreign key (invoice_id) references public.invoices (id) on delete set null;
alter table public.class_enrollments add constraint enrollments_invoice_fk foreign key (invoice_id) references public.invoices (id) on delete set null;
alter table public.court_reservations add constraint reservations_invoice_fk foreign key (invoice_id) references public.invoices (id) on delete set null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  description text not null,
  category public.spend_category not null,
  amount_cents integer not null,
  application_fee_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null check (status in ('succeeded', 'refunded', 'failed')),
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  receipt_url text,
  card_brand text,
  card_last4 text,
  paid_at timestamptz not null default now()
);
create index on public.payments (user_id, paid_at desc);

-- Saved cards mirror (Stripe is the source of truth; written by webhook).
create table public.payment_methods (
  id text primary key,  -- Stripe pm_...
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand text not null,
  last4 text not null,
  exp_month smallint not null,
  exp_year smallint not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- Gear purchases logged by the user so spending covers all three categories.
create table public.gear_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  spent_at date not null default current_date,
  wardrobe_item_id uuid references public.wardrobe_items (id) on delete set null
);

create view public.spending_summary with (security_invoker = true) as
  select user_id, date_trunc('month', at)::date as month, category, sum(amount_cents)::bigint as amount_cents, count(*) as transactions
  from (
    select user_id, paid_at as at, category, case when status = 'refunded' then 0 else amount_cents end as amount_cents
    from public.payments where status in ('succeeded', 'refunded')
    union all
    select user_id, spent_at::timestamptz, 'gear'::public.spend_category, amount_cents from public.gear_expenses
  ) t
  group by user_id, month, category;

create table public.calendar_links (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'apple')),
  feed_token uuid not null default gen_random_uuid() unique,  -- private ICS feed for Apple/Google subscription
  external_calendar_id text,
  two_way boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create view public.calendar_events with (security_invoker = true) as
  select 'lesson'::text as type, l.id, l.student_id as user_id,
         initcap(replace(l.kind::text, '_', '-')) || ' lesson' as title, l.starts_at, l.ends_at, l.court_id, l.status::text as status
  from public.lessons l where l.status <> 'cancelled'
  union all
  select 'class', c.id, e.student_id, c.title, c.starts_at, c.starts_at + make_interval(mins => c.duration_min), c.court_id, e.status::text
  from public.class_enrollments e join public.classes c on c.id = e.class_id where e.status <> 'cancelled' and not c.cancelled
  union all
  select 'court', r.id, r.player_id, 'Court reservation', s.starts_at, s.ends_at, s.court_id, r.status::text
  from public.court_reservations r join public.court_slots s on s.id = r.slot_id where r.status <> 'cancelled'
  union all
  select 'workout', w.id, w.player_id, w.title, w.scheduled_for,
         w.scheduled_for + make_interval(mins => coalesce(w.duration_min, 45)), null, case when w.completed_at is null then 'planned' else 'completed' end
  from public.workouts w where w.scheduled_for is not null;

alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.stripe_events enable row level security;
alter table public.gear_expenses enable row level security;
alter table public.calendar_links enable row level security;

create policy "students see invoices; coaches see invoices they are paid on" on public.invoices for select to authenticated
  using (student_id = (select auth.uid()) or payee_coach_id = (select auth.uid()));
create policy "users see their payments" on public.payments for select to authenticated using (user_id = (select auth.uid()));
create policy "users see their cards" on public.payment_methods for select to authenticated using (user_id = (select auth.uid()));
create policy "users log gear expenses" on public.gear_expenses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users manage calendar links" on public.calendar_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
