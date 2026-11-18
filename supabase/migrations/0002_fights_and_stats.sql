-- Dropy z jednej walki są grupowane przez fight_id.
-- Dzięki temu można liczyć szansę na drop jako:
--   (liczba walk, w których co najmniej raz wypadł przedmiot) / (liczba walk)

alter table public.boss_drops add column if not exists fight_id text;

create index if not exists boss_drops_fight_idx on public.boss_drops (fight_id);

drop view if exists public.drop_stats;
create view public.drop_stats as
select
  boss_id,
  variant,
  item_name,
  added_by,
  count(*)::int as times_dropped,
  count(distinct fight_id)::int as fights_with_item,
  max(dropped_at) as last_dropped_at
from public.boss_drops
group by boss_id, variant, item_name, added_by;

drop view if exists public.item_stats;
create view public.item_stats as
select
  boss_id,
  variant,
  item_name,
  count(*)::int as times_dropped,
  count(distinct fight_id)::int as fights_with_item
from public.boss_drops
group by boss_id, variant, item_name;

drop view if exists public.boss_fight_stats;
create view public.boss_fight_stats as
select
  boss_id,
  variant,
  count(distinct fight_id)::int as total_fights,
  count(*)::int as total_drops
from public.boss_drops
group by boss_id, variant;

grant select on public.drop_stats to anon, authenticated;
grant select on public.item_stats to anon, authenticated;
grant select on public.boss_fight_stats to anon, authenticated;
