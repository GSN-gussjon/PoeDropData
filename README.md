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

The boss view has a **Symuluj walkę** button for bosses with mechanics data
(`public/boss-mechanics.json`, currently The Maven). It opens a fullscreen 2D canvas
fight simulator: click to move, automatic attack, configurable DPS/HP/regen, the
boss's real base HP, all **7 phases** (four Maven, three Nucleus), telegraphed attacks
with voice lines from the wiki, and a reward screen rolling from `drops.json`. The
„Stand still!" (Tri-Beam Claws) attack uses a dedicated controller (`sim/triBeam.ts`):
six thin threads in two groups of three anchored at Maven's hands: the right group
rotates left, the left group rotates right, they cross in the middle and keep rotating
until the attack ends. The beams end exactly at the connector line. The connectors are
perpendicular to their direction of travel (they move „across", not along it) and meet
at the player's position at the moment the attack starts. The threads themselves are visual
only — damage comes from the straight connector drawn across the three threads at the
distance of the player's starting position (not at the arena edge). Independent of the player, with swept collision and separate
preparation/telegraph/active phases. Its geometry, speed and damage are configurable
in `public/boss-mechanics.json` under `triBeam`. The „A cascade of pain!" attack has its
own controller (`sim/cascade.ts`): five sequential, piercing ice balls aimed at the
player, configurable under `cascade`. The „Decelerating Projectiles" attack has its own controller (`sim/decel.ts`): three
orbs slow down, then accelerate while chasing the player and leave Gravity Wells
(cold DOT + 50% action-speed slow) on detonation, configurable under `decel`. The
Memory Game has its own controller (`sim/memory.ts`): a purple
sequence in three arena zones, then „Scurry, scurry!" with a blast expanding from the
centre; wrong steps slow the player and accelerate the blast, configurable under
`memory`. Its first use in a fight is always a 3-step pattern (and never before 60 s
of combat), every later one has 6 steps, and its cooldown is 60 s. After each Nucleus
phase Maven prefers Memory Game with 90% probability; other Maven attacks have a 5 s
cooldown. Maven can also teleport to a random point of the arena (`kind: teleport`).
The arena also has two small platforms on the outer rim, 180° apart,
sharing one rotation (`sim/platforms.ts`); they stop during Brain Blast and become the
only safe spots. The platforms are elongated tangential capsules (`length`, `radius`
in `public/boss-mechanics.json`) and rotate at half the previous speed. During Brain
Blast the player can move freely anywhere inside a platform. `sim/brainBlast.ts` handles the slowdown, expanding blast, 3 s window
to step back onto the arena, push-off and resumption of rotation. Brain Blast runs only
once per Nucleus phase — as its very first attack — and the Nucleus is invulnerable
while it lasts. Each phase change has a 3 s pause with no attacks or damage. After
every attack Maven pauses for 4 s during which only her basic auto attack is available
— a pink projectile fired toward the player at most every 2 s (configurable under
`autoAttack`); it never overlaps other skills, and its cooldown starts when the
previous attack fully finishes. The Nucleus phases have permanent rotating Brain Beams
locked to the platforms' rotation so they cross each platform's centre, and they do
not appear during Brain Blast. The final phase has five rotating beams with moving
gaps. Both use a blue-white energy beam with a glowing core and pink/blue outer glow
(the rotating beams tinted blue, the gapped final beams pink).
The Memory Game uses a 3-zone pattern in phase 3 and 6-zone
patterns later, with a slowly expanding blast that punishes wrong steps. Results stay
in `localStorage` only — nothing is written to Supabase. Mechanics data comes from
poewiki.net, poedb.tw and the Maxroll boss guide (CC BY-NC-SA 3.0).

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
