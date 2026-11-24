-- Aces: reels (incl. Instagram imports), journal articles, saved library.

create type public.reel_source as enum ('instagram', 'youtube', 'upload');
create type public.publish_status as enum ('pending', 'published', 'rejected');

create table public.reels (
  id uuid primary key default gen_random_uuid(),
  source public.reel_source not null,
  source_url text not null,
  external_id text,          -- Instagram shortcode, YouTube id
  embed_url text,
  video_path text,           -- storage path for uploads
  creator_handle text not null default '',
  creator_name text,
  title text not null default '',
  caption text,
  category text not null default 'GENERAL',
  thumbnail_url text,
  duration_s integer,
  status public.publish_status not null default 'pending',
  metadata jsonb not null default '{}',  -- raw oEmbed payload etc.
  imported_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index on public.reels (published_at desc) where status = 'published';

create table public.reel_likes (
  reel_id uuid not null references public.reels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);


create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  slug text not null unique,
  title text not null,
  dek text not null default '',
  category text not null check (category in ('MENTAL GAME', 'TACTICS', 'EQUIPMENT', 'HISTORY', 'TECHNIQUE', 'FITNESS')),
  body_md text not null,
  header_art text not null default 'court',  -- line-art key, never a photo
  read_minutes smallint not null default 5,
  featured boolean not null default false,
  status public.publish_status not null default 'pending',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create type public.saved_kind as enum ('reel', 'article', 'tutorial', 'swing_analysis');

create table public.saved_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  icon text not null default 'folder',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  folder_id uuid references public.saved_folders (id) on delete set null,
  kind public.saved_kind not null,
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);

create view public.saved_folder_summary with (security_invoker = true) as
  select f.id, f.name, f.icon, f.created_at,
         count(i.id) as item_count,
         max(i.created_at) as updated_at
  from public.saved_folders f
  left join public.saved_items i on i.folder_id = f.id
  group by f.id;

create view public.reel_feed with (security_invoker = true) as
  select r.id, r.source, r.source_url, r.external_id, r.embed_url, r.video_path, r.creator_handle, r.creator_name,
         r.title, r.caption, r.category, r.thumbnail_url, r.duration_s, r.published_at,
         (select count(*) from public.reel_likes l where l.reel_id = r.id) as like_count,
         exists (select 1 from public.reel_likes l where l.reel_id = r.id and l.user_id = (select auth.uid())) as liked,
         exists (select 1 from public.saved_items s where s.kind = 'reel' and s.ref_id = r.id and s.user_id = (select auth.uid())) as saved
  from public.reels r
  where r.status = 'published';

alter table public.reels enable row level security;
alter table public.reel_likes enable row level security;
alter table public.articles enable row level security;
alter table public.saved_folders enable row level security;
alter table public.saved_items enable row level security;

create policy "published reels are public; importers and admins see pending" on public.reels for select to anon, authenticated
  using (status = 'published' or imported_by = (select auth.uid()) or public.is_admin());
create policy "admins moderate reels" on public.reels for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete reels" on public.reels for delete to authenticated using (public.is_admin());

create policy "likes are readable" on public.reel_likes for select to authenticated using (true);
create policy "users like reels" on public.reel_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users unlike reels" on public.reel_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "published articles are public" on public.articles for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()) or public.is_admin());
create policy "coaches draft articles" on public.articles for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_coach() and status = 'pending');
create policy "authors edit drafts; admins publish" on public.articles for update to authenticated
  using ((author_id = (select auth.uid()) and status = 'pending') or public.is_admin())
  with check ((author_id = (select auth.uid()) and status = 'pending') or public.is_admin());

create policy "users own folders" on public.saved_folders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users own saved items" on public.saved_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (folder_id is null or exists (select 1 from public.saved_folders f where f.id = folder_id and f.user_id = (select auth.uid()))));
