-- Wardrobe, product catalog, multi-retailer deals, racket recommendations.

create type public.gear_kind as enum ('racket', 'strings', 'shoes', 'apparel', 'bag', 'accessory', 'wearable');

create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  kind public.gear_kind not null,
  brand text not null default '',
  model text not null default '',
  nickname text,
  primary_item boolean not null default false,
  -- rackets
  head_size_sq_in smallint,
  weight_g smallint,
  grip_size text,
  string_name text,
  tension_main_lbs numeric(4, 1),
  tension_cross_lbs numeric(4, 1),
  strung_at date,
  hours_since_restring numeric(6, 1) not null default 0,
  restring_every_hours numeric(6, 1) not null default 30,
  -- shoes / apparel
  size text,
  surface public.court_surface,
  image_path text,  -- real racket photo (allowed exception)
  details jsonb not null default '{}',
  retired_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.wardrobe_items (player_id) where retired_at is null;

create view public.wardrobe_overview with (security_invoker = true) as
  select w.*,
    (w.kind = 'racket' and w.hours_since_restring >= w.restring_every_hours) as restring_due,
    greatest(w.restring_every_hours - w.hours_since_restring, 0) as hours_until_restring
  from public.wardrobe_items w
  where w.retired_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category public.gear_kind not null,
  brand text not null,
  model text not null,
  year smallint,
  msrp_cents integer,
  image_url text,
  specs jsonb not null default '{}',     -- {head_size, weight_g, balance_mm, swingweight, stiffness_ra, pattern}
  profile jsonb not null default '{}',   -- {power, control, spin, comfort} 0-100 for the recommender
  gtin text unique,
  rating numeric(2, 1),
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (brand, model, year)
);

create table public.deal_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  retailer text not null,
  title text not null default '',
  price_cents integer not null check (price_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer generated always as (price_cents + shipping_cents) stored,
  currency text not null default 'USD',
  condition text not null default 'new' check (condition in ('new', 'used', 'demo', 'refurbished')),
  in_stock boolean not null default true,
  url text not null,
  match_confidence real check (match_confidence between 0 and 1),
  fetched_at timestamptz not null default now(),
  unique (product_id, retailer, url)
);
create index on public.deal_offers (product_id, in_stock, total_cents);

create table public.deal_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null,
  product_id uuid references public.products (id) on delete set null,
  agent_job_id uuid references public.agent_jobs (id) on delete set null,
  sources_checked text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.racket_recommendations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  agent_job_id uuid references public.agent_jobs (id) on delete set null,
  inputs jsonb not null,           -- {swing_speed, arm_comfort, skill, playstyle}
  picks jsonb not null default '[]', -- [{product_id, fit_score, why, string, tension_range}]
  created_at timestamptz not null default now()
);

alter table public.wardrobe_items enable row level security;
alter table public.products enable row level security;
alter table public.deal_offers enable row level security;
alter table public.deal_searches enable row level security;
alter table public.racket_recommendations enable row level security;

create policy "players own wardrobe" on public.wardrobe_items for all to authenticated
  using (player_id = (select auth.uid())) with check (player_id = (select auth.uid()));
create policy "coaches see students' gear" on public.wardrobe_items for select to authenticated using (public.can_view_player(player_id));
create policy "catalog is public" on public.products for select to anon, authenticated using (true);
create policy "offers are public" on public.deal_offers for select to anon, authenticated using (true);
create policy "users see their searches" on public.deal_searches for select to authenticated using (user_id = (select auth.uid()));
create policy "players see their recommendations" on public.racket_recommendations for select to authenticated using (player_id = (select auth.uid()));
