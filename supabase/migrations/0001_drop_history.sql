-- Historia dropów bossów dla aplikacji PoE Boss Scrapper.
-- Dane są publicznie czytelne i publicznie zapisywalne (bez logowania),
-- ale nie można ich modyfikować ani usuwać.

create table if not exists public.boss_drops (
  id bigint generated always as identity primary key,
  boss_id text not null,
  variant text not null,
  item_name text not null,
  dropped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  note text,
  added_by text
);

alter table public.boss_drops add column if not exists added_by text;

create index if not exists boss_drops_boss_variant_idx
  on public.boss_drops (boss_id, variant);
create index if not exists boss_drops_dropped_at_idx
  on public.boss_drops (dropped_at desc);

alter table public.boss_drops enable row level security;

drop policy if exists "public read drops" on public.boss_drops;
create policy "public read drops"
  on public.boss_drops for select
  to anon, authenticated
  using (true);

drop policy if exists "public insert drops" on public.boss_drops;
create policy "public insert drops"
  on public.boss_drops for insert
  to anon, authenticated
  with check (
    char_length(boss_id) between 1 and 100
    and char_length(variant) between 1 and 100
    and char_length(item_name) between 1 and 200
    and (added_by is null or char_length(added_by) between 1 and 60)
  );

drop view if exists public.drop_stats;
create view public.drop_stats as
select
  boss_id,
  variant,
  item_name,
  added_by,
  count(*)::int as times_dropped,
  max(dropped_at) as last_dropped_at
from public.boss_drops
group by boss_id, variant, item_name, added_by;

grant usage on schema public to anon, authenticated;
grant select, insert on public.boss_drops to anon, authenticated;
grant select on public.drop_stats to anon, authenticated;
