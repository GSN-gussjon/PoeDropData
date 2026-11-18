-- Usuwanie własnych wpisów: właściciel jest identyfikowany przez losowy token
-- zapisany w przeglądarce i przesyłany jako nagłówek x-owner-token.
-- Nick służy tylko do wyświetlania — nie jest podstawą do autoryzacji.

alter table public.boss_drops add column if not exists owner_token text;

create index if not exists boss_drops_owner_token_idx on public.boss_drops (owner_token);

drop policy if exists "public insert drops" on public.boss_drops;
create policy "public insert drops"
  on public.boss_drops for insert
  to anon, authenticated
  with check (
    char_length(boss_id) between 1 and 100
    and char_length(variant) between 1 and 100
    and char_length(item_name) between 1 and 200
    and (added_by is null or char_length(added_by) between 1 and 60)
    and (owner_token is null or char_length(owner_token) between 1 and 100)
  );

drop policy if exists "owner deletes own drops" on public.boss_drops;
create policy "owner deletes own drops"
  on public.boss_drops for delete
  to anon, authenticated
  using (
    owner_token is not null
    and owner_token = coalesce(
      current_setting('request.headers', true)::json ->> 'x-owner-token',
      ''
    )
  );
