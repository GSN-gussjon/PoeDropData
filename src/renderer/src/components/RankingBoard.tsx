import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'

type RankingRow = {
  added_by: string
  kills: number
  drops: number
  total_chaos: number
  total_divine: number
}

function formatChaos(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k c`
  return `${Number(value.toFixed(1))}c`
}

export function RankingBoard({ username }: { username: string }) {
  const [rows, setRows] = useState<RankingRow[]>([])
  const [sortBy, setSortBy] = useState<'value' | 'kills'>('value')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const refresh = () => {
      supabase
        .from('player_ranking')
        .select('*')
        .order('total_chaos', { ascending: false })
        .then(({ data, error: fetchError }) => {
          if (!active) return
          if (fetchError) setError(fetchError.message)
          else {
            setError(null)
            setRows((data ?? []) as RankingRow[])
          }
          setLoading(false)
        })
    }

    refresh()
    const interval = window.setInterval(refresh, 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        sortBy === 'kills'
          ? b.kills - a.kills || Number(b.total_chaos) - Number(a.total_chaos)
          : Number(b.total_chaos) - Number(a.total_chaos) || b.kills - a.kills
      ),
    [rows, sortBy]
  )

  const totalKills = rows.reduce((sum, row) => sum + row.kills, 0)
  const totalValue = rows.reduce((sum, row) => sum + Number(row.total_chaos), 0)

  return (
    <section className="ranking-board">
      <header className="content-header">
        <div>
          <div className="content-kicker">Ranking zbiorczy</div>
          <p className="stats-subtitle">
            Wartość dropu liczona z cen w momencie dodania wpisu. Odświeża się co 30 s.
          </p>
        </div>
        <div className="ranking-controls">
          <label>
            Sortuj:
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'value' | 'kills')}>
              <option value="value">Wartość dropu</option>
              <option value="kills">Ilość bossów</option>
            </select>
          </label>
          <div className="stats-totals">
            <div><strong>{totalKills}</strong> bossów</div>
            <div><strong>{formatChaos(totalValue)}</strong> łącznie</div>
          </div>
        </div>
      </header>

      {error && <div className="log-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Ładowanie rankingu...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◇</div>
          <h2>Brak wpisów</h2>
          <p>Zaloguj dropy w zakładce „Zapis dropu", a ranking uzupełni się sam.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="drop-table ranking-table">
            <thead>
              <tr>
                <th className="ranking-place">#</th>
                <th>Gracz</th>
                <th>Ilość bossów</th>
                <th>Wartość dropu</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr key={row.added_by} className={row.added_by === username ? 'own-row' : ''}>
                  <td className="ranking-place">{index + 1}</td>
                  <td>{row.added_by}</td>
                  <td>{row.kills}</td>
                  <td className="ranking-value">
                    {formatChaos(Number(row.total_chaos))}
                    {Number(row.total_divine) >= 1 && (
                      <small> {Number(row.total_divine).toFixed(1)} div</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
