-- Ranking dla konkretnego bossa (i wariantu), niezależny od rankingu zbiorczego.

drop view if exists public.boss_player_ranking;
create view public.boss_player_ranking as
select
  boss_id,
  variant,
  added_by,
  count(distinct fight_id)::int as kills,
  count(*)::int as drops,
  coalesce(sum(chaos_value), 0)::numeric as total_chaos,
  coalesce(sum(divine_value), 0)::numeric as total_divine
from public.boss_drops
where added_by is not null
group by boss_id, variant, added_by;

grant select on public.boss_player_ranking to anon, authenticated;
