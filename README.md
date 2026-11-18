# PoE Boss Scrapper (web)

A static web app that shows the current drop table of a selected Path of Exile boss.
Drop chances are scraped automatically from [poewiki.net](https://www.poewiki.net/) and
published together with the site — no manual data editing.

The boss list covers pinnacle bosses, Uber Elder (with the **Uber Uber Elder** variant),
the Ritual boss **The King in the Mists**, and Delve bosses (Aul, Kurgal, Ahuatotli).
Delve pages list drop-restricted items
without probabilities, so those entries have no wiki chance; real chances appear in the
**Statystyka** tab once drops are logged.

## How it works

```
GitHub Actions (daily)
  Playwright / Chromium → poewiki.net (Anubis proof-of-work solved by the browser)
      ↓ parse "Drop tables"
  public/drops.json  (chances + source + timestamp)
      ↓
  Vite build (React) → dist/
      ↓
  GitHub Pages
```

The app fetches `drops.json` at runtime and validates it with the shared Zod schema.
If fetching fails, the last successfully loaded data stays on screen.

## Local development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs dist/
npm run preview   # preview the production build
```

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages → Build and deployment**, set **Source: GitHub Actions**.
3. The workflow `.github/workflows/scrape.yml` runs daily, on push and on demand. It
   scrapes the wiki, validates the data, builds with the correct `base` path
   (`/<repository-name>/`) and deploys to Pages.
4. Trigger manually via **Actions → Refresh data and deploy to GitHub Pages → Run workflow**.

The `base` path is injected automatically as `VITE_BASE_PATH` from the repository name,
so no configuration file needs editing. For a custom domain, set `VITE_BASE_PATH=/` in
the workflow instead.

## Drop history (Supabase)

A free Supabase project stores the drop log. Table `boss_drops` and view `drop_stats`
are defined in `supabase/migrations/0001_drop_history.sql`. Row Level Security allows
anyone to SELECT and INSERT, but not to UPDATE or DELETE. The anon key is public by
design and is baked into the frontend; there are no secrets in GitHub Actions.

The app has three tabs: **Drop table** (wiki data), **Zapis dropu** (drop log) and
**Statystyka** (drop chances computed from real entries, not from the wiki). On the log
tab, click item tiles generated from the selected boss to select the drops from one
fight; clicking a tile again (or its „×" chip) undoes the selection. Press „Zapisz drop"
to commit all selected items at once — they share one `fight_id`, so a multi-drop fight
is counted once per item in the statistics. On first
visit the app asks for a nick; it is kept in `localStorage` of that browser, can be
changed via „zmień", and is stored as `added_by` with every drop. The log shows recent
entries with their author and fight badge, plus a summary per item (with a per-user
breakdown).

Each entry can be deleted only from the browser that created it. A random owner token
is kept in `localStorage` and sent as `x-owner-token`; the RLS delete policy in
`supabase/migrations/0003_owner_delete.sql` checks it. Deletion asks for confirmation
inline before removing the row.

Drop tiles show current prices from poe.ninja, refreshed by the same scraper into
`public/prices.json` (the API has no CORS support, so the browser cannot call it
directly). The current challenge league is detected automatically. When poe.ninja
provides several variants, the price prefers an uncorrupted/unidentified entry and
otherwise uses the most-listed one.

Statistics use the views in `supabase/migrations/0002_fights_and_stats.sql`:
`item_stats` counts fights in which an item dropped, `boss_fight_stats` counts all
fights for a boss variant. Chance = fights with item / all fights.

To re-apply the migration locally, put the credentials in `.env.local` (gitignored):

```
SUPABASE_ACCESS_TOKEN=...
SUPABASE_PROJECT_REF=...
```

then run `npm run db:migrate`.

Notes: Supabase free projects are paused after a period of inactivity and can be
resumed from the dashboard. The Management API token is only needed for `db:migrate`;
the app itself uses the public anon key. If the token was ever shared, regenerate it in
Supabase → Account settings → Access tokens and update `.env.local`.

## Data

Canonical data lives in `public/drops.json`. Refresh it locally with:

```bash
npx playwright install chromium   # first time only
npm run scrape                    # all bosses
npm run scrape:maven              # one boss
HEADLESS=false npm run scrape     # headed mode (helps if Anubis blocks headless)
```

If parsing fails for a boss, the previous entry is kept — never an empty table.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview production build |
| `npm run scrape` | Refresh `public/drops.json` from poewiki.net |
| `npm test` | Parser and data validation tests |
| `npm run typecheck` | TypeScript check |

## Licensing and ethics

- Wiki content is **CC BY-NC-SA 3.0** — the UI shows attribution and links to the source.
  Intended for non-commercial use.
- poewiki.net is protected by Anubis. The scraper runs **once per day**, identifies itself
  with a User-Agent and uses a real browser. Please do not increase the frequency.
- A wiki layout change requires a parser fix — that is code maintenance, not manual data
  entry. The golden test for The Maven (100% sums) catches most regressions.
