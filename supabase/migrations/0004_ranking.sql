-- Cena zapisana w momencie dodania dropu — ranking nie zmienia się,
-- gdy poe.ninja zaktualizuje bieżące ceny.

alter table public.boss_drops add column if not exists chaos_value numeric;
alter table public.boss_drops add column if not exists divine_value numeric;
alter table public.boss_drops add column if not exists price_league text;

create index if not exists boss_drops_added_by_idx on public.boss_drops (added_by);

drop view if exists public.player_ranking;
create view public.player_ranking as
select
  added_by,
  count(distinct fight_id)::int as kills,
  count(*)::int as drops,
  coalesce(sum(chaos_value), 0)::numeric as total_chaos,
  coalesce(sum(divine_value), 0)::numeric as total_divine
from public.boss_drops
where added_by is not null
group by added_by;

grant select on public.player_ranking to anon, authenticated;
