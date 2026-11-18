import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Boss, DropRow } from '../../../../shared/schema'
import { ownerToken, supabase } from '../supabase'

type DropEntry = {
  id: number
  boss_id: string
  variant: string
  item_name: string
  dropped_at: string
  added_by: string | null
  fight_id: string | null
  owner_token: string | null
}

type DropStat = {
  boss_id: string
  variant: string
  item_name: string
  added_by: string | null
  times_dropped: number
  fights_with_item: number
}

type Tile = {
  variant: string
  name: string
  iconUrl?: string
  type: DropRow['type']
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fight-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function tileKey(tile: Tile): string {
  return `${tile.variant}|${tile.name}`
}

const JUNK_NAME = /^(always|several|note|one of the|the following|drops? on|chance to)\b/i

function isRealItem(name: string): boolean {
  const value = name.trim()
  if (
    !value ||
    value.endsWith(':') ||
    JUNK_NAME.test(value) ||
    /-influenced$/i.test(value) ||
    /\b(crusader|hunter|redeemer|warlord|shaper|elder)[- ]items?$/i.test(value)
  ) return false
  // Voidstony to przedmioty questowe — wypadają tylko przy pierwszej walce.
  if (/voidstone/i.test(value)) return false
  return true
}

function collectTiles(boss: Boss): Tile[] {
  const seen = new Set<string>()
  const tiles: Tile[] = []
  for (const variant of boss.variants) {
    for (const section of variant.sections) {
      for (const row of section.rows) {
        for (const item of [row, ...row.children]) {
          if (!isRealItem(item.name)) continue
          const tile = {
            variant: variant.label,
            name: item.name,
            iconUrl: item.iconUrl,
            type: item.type
          }
          const key = tileKey(tile)
          if (seen.has(key)) continue
          seen.add(key)
          tiles.push(tile)
        }
      }
    }
  }
  return tiles
}

export function DropLog({
  boss,
  username,
  onChangeUsername
}: {
  boss: Boss
  username: string
  onChangeUsername: () => void
}) {
  const [entries, setEntries] = useState<DropEntry[]>([])
  const [stats, setStats] = useState<DropStat[]>([])
  const [selected, setSelected] = useState<Tile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  const tiles = useMemo(() => collectTiles(boss), [boss])

  useEffect(() => {
    setSelected([])
  }, [boss.id])

  const load = useCallback(async () => {
    setLoading(true)
    const [entriesResult, statsResult] = await Promise.all([
      supabase
        .from('boss_drops')
        .select('*')
        .eq('boss_id', boss.id)
        .order('dropped_at', { ascending: false })
        .limit(40),
      supabase.from('drop_stats').select('*').eq('boss_id', boss.id)
    ])
    if (entriesResult.error) setError(entriesResult.error.message)
    else setEntries(entriesResult.data as DropEntry[])
    if (!statsResult.error) setStats(statsResult.data as DropStat[])
    setLoading(false)
  }, [boss.id])

  useEffect(() => {
    void load()
  }, [load])

  function toggleTile(tile: Tile) {
    setNotice(null)
    setSelected((current) => {
      const key = tileKey(tile)
      return current.some((item) => tileKey(item) === key)
        ? current.filter((item) => tileKey(item) !== key)
        : [...current, tile]
    })
  }

  async function saveDrops() {
    if (selected.length === 0 || saving) return
    setSaving(true)
    setError(null)
    const fightId = newId()
    const now = new Date().toISOString()
    const { error: insertError } = await supabase.from('boss_drops').insert(
      selected.map((tile) => ({
        boss_id: boss.id,
        variant: tile.variant,
        item_name: tile.name,
        added_by: username,
        fight_id: fightId,
        owner_token: ownerToken || null,
        dropped_at: now
      }))
    )
    if (insertError) {
      setError(insertError.message)
    } else {
      setSelected([])
      setNotice(`Zapisano ${selected.length} ${selected.length === 1 ? 'drop' : 'dropy'} z jednej walki.`)
      window.setTimeout(() => setNotice(null), 3000)
      await load()
    }
    setSaving(false)
  }

  async function deleteEntry(id: number) {
    setError(null)
    const { error: deleteError } = await supabase.from('boss_drops').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      setConfirmingId(null)
      setNotice('Wpis usunięty.')
      window.setTimeout(() => setNotice(null), 3000)
      await load()
    }
  }

  const totals = useMemo(() => {
    const map = new Map<string, number>()
    for (const stat of stats) {
      map.set(stat.item_name, (map.get(stat.item_name) ?? 0) + stat.times_dropped)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [stats])

  const totalDrops = totals.reduce((sum, [, count]) => sum + count, 0)

  return (
    <section className="drop-log">
      <div className="drop-log-header">
        <div>
          <div className="content-kicker">Drop history</div>
          <h2>Zapisz drop — {boss.name}</h2>
          <p className="drop-log-user">
            Nick: <strong>{username}</strong>{' '}
            <button type="button" className="inline-link" onClick={onChangeUsername}>
              zmień
            </button>
          </p>
        </div>
        <span className="drop-log-source">Supabase · zapis współdzielony</span>
      </div>

      <div className="pending-card">
        <div className="pending-head">
          <div>
            <div className="content-kicker">Do zapisania</div>
            <div className="pending-count">
              {selected.length === 0
                ? 'Wybierz przedmioty poniżej'
                : `${selected.length} ${selected.length === 1 ? 'przedmiot' : 'przedmiotów'} · jedna walka`}
            </div>
          </div>
          <div className="pending-actions">
            {selected.length > 0 && (
              <button type="button" className="inline-link" onClick={() => setSelected([])}>
                wyczyść
              </button>
            )}
            <button
              type="button"
              className="log-button"
              onClick={() => void saveDrops()}
              disabled={selected.length === 0 || saving}
            >
              {saving ? 'Zapisywanie…' : 'Zapisz drop'}
            </button>
          </div>
        </div>
        <div className="pending-chips">
          {selected.length === 0 ? (
            <span className="muted">
              Kliknij kafelek, aby dodać przedmiot. Kliknij ponownie lub „×", aby cofnąć.
            </span>
          ) : (
            selected.map((tile) => (
              <span className="pending-chip" key={tileKey(tile)}>
                {tile.name} <small>{tile.variant}</small>
                <button
                  type="button"
                  onClick={() => toggleTile(tile)}
                  aria-label={`Cofnij ${tile.name}`}
                  title="Cofnij wybór"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {notice && <div className="log-notice">{notice}</div>}
      {error && <div className="log-error">{error}</div>}

      <h3 className="log-section-title">Kliknij przedmioty, które wypadły w tej walce</h3>
      {tiles.length === 0 ? (
        <div className="muted">Brak przedmiotów do zalogowania dla tego bossa.</div>
      ) : (
        <div className="tile-grid">
          {tiles.map((tile) => {
            const isSelected = selected.some((item) => tileKey(item) === tileKey(tile))
            return (
              <button
                type="button"
                key={tileKey(tile)}
                className={`item-tile ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleTile(tile)}
                disabled={saving}
                title={isSelected ? `${tile.name} — kliknij, aby cofnąć` : `${tile.name} · ${tile.variant}`}
              >
                {isSelected && <span className="tile-check">✓</span>}
                <span className="tile-icon">
                  {tile.iconUrl ? <img src={tile.iconUrl} alt="" /> : <span className="tile-fallback">◇</span>}
                </span>
                <span className="tile-name">{tile.name}</span>
                <span className={`tile-variant ${tile.variant.toLowerCase().includes('uber') ? 'uber' : ''}`}>
                  {tile.variant}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="drop-log-summary">
        <div className="summary-number">{totalDrops}</div>
        <div>
          <div className="content-kicker">Łącznie zalogowanych dropów</div>
          <div className="muted">Dla bossa {boss.name}, od wszystkich użytkowników.</div>
        </div>
      </div>

      <div className="drop-log-body">
        <div>
          <h3>Ostatnie wpisy</h3>
          {loading ? (
            <div className="muted">Ładowanie…</div>
          ) : entries.length === 0 ? (
            <div className="muted">Brak wpisów dla tego bossa.</div>
          ) : (
            <ul className="history-list">
              {entries.map((entry) => {
                const isOwn = !!ownerToken && entry.owner_token === ownerToken
                return (
                  <li key={entry.id}>
                    <span className="history-item">{entry.item_name}</span>
                    <span className="history-user">{entry.added_by ?? '—'}</span>
                    <span className="history-variant">{entry.variant}</span>
                    <span className="history-date">{new Date(entry.dropped_at).toLocaleString()}</span>
                    {isOwn &&
                      (confirmingId === entry.id ? (
                        <span className="confirm-inline">
                          Na pewno?
                          <button type="button" onClick={() => void deleteEntry(entry.id)}>Tak</button>
                          <button type="button" onClick={() => setConfirmingId(null)}>Nie</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="delete-drop"
                          onClick={() => setConfirmingId(entry.id)}
                        >
                          usuń
                        </button>
                      ))}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div>
          <h3>Podsumowanie</h3>
          {totals.length === 0 ? (
            <div className="muted">Brak danych.</div>
          ) : (
            <ul className="stats-list">
              {totals.map(([item, count]) => (
                <li key={item}>
                  <div className="stats-item">
                    <span>{item}</span>
                    <strong>{count}×</strong>
                  </div>
                  <div className="stats-users">
                    {stats
                      .filter((stat) => stat.item_name === item)
                      .map((stat) => (
                        <span key={`${stat.variant}-${stat.added_by}`}>
                          {stat.added_by ?? '—'}: {stat.times_dropped}
                        </span>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
