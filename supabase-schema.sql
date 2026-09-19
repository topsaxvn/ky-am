-- Run this once in your Supabase project's SQL Editor
-- (https://supabase.com/dashboard/project/thvhoethafeeytxjktbp/sql/new)
-- It only creates a new "songs" table; it does not touch any existing tables.

create table if not exists public.songs (
  id text primary key,
  title text not null default 'Bài hát mới',
  lines jsonb not null default '[]'::jsonb,
  scale_root int not null default 0,
  scale_type text not null default 'major',
  instrument text not null default 'piano',
  naming text not null default 'letter',
  song_key int not null default 0,
  updated_at timestamptz not null default now()
);

-- Publish status: only songs with published = true are listed on the /view page.
-- (Safe to run on an existing table; existing songs stay drafts.)
alter table public.songs add column if not exists published boolean not null default false;

-- Singer name, searchable on the /view page.
alter table public.songs add column if not exists singer text not null default '';

alter table public.songs enable row level security;

-- No login/auth in this app yet, so allow the public (anon) key full access.
-- Anyone who has the anon key (visible in the app's source) can read/write/delete
-- rows in this table. Fine for personal/solo use; add Supabase Auth later if needed.
create policy "public read songs" on public.songs
  for select using (true);

create policy "public insert songs" on public.songs
  for insert with check (true);

create policy "public update songs" on public.songs
  for update using (true);

create policy "public delete songs" on public.songs
  for delete using (true);
