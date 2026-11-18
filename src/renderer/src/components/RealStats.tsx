import { useEffect, useMemo, useState } from 'react'
import type { Boss, DropRow } from '../../../../shared/schema'
import { supabase } from '../supabase'

type FightStat = {
  boss_id: string
  variant: string
  total_fights: number
  total_drops: number
}

type ItemStat = {
  boss_id: string
  variant: string
  item_name: string
  times_dropped: number
  fights_with_item: number
}

type StatRow = {
  name: string
  iconUrl?: string
  chance?: number
  fightsWithItem: number
  times: number
  children: StatRow[]
}

const CANONICAL = ['Guaranteed Unique', 'Encounter-specific drops', 'Additional drops']

function formatChance(value: number): string {
  if (value >= 10) return `${value.toFixed(0)}%`
  if (value >= 1) return `${value.toFixed(1)}%`
  return `${value.toFixed(2)}%`
}

function StatItem({ row, total }: { row: StatRow; total: number }) {
  return (
    <li className="real-stat-row">
      <span className="drop-row-main">
        {row.iconUrl && <img className="drop-icon" src={row.iconUrl} alt="" />}
        <span className="drop-name">{row.name}</span>
        {row.chance !== undefined && <span className="real-chance">{formatChance(row.chance)}</span>}
      </span>
      <span className="real-sample">
        {row.fightsWithItem}/{total} walk · {row.times}×
      </span>
      {row.children.length > 0 && (
        <ul className="drop-children">
          {row.children.map((child, index) => (
            <StatItem key={`${child.name}-${index}`} row={child} total={total} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function RealStats({ boss }: { boss: Boss }) {
  const [fights, setFights] = useState<FightStat[]>([])
  const [items, setItems] = useState<ItemStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('boss_fight_stats').select('*').eq('boss_id', boss.id),
      supabase.from('item_stats').select('*').eq('boss_id', boss.id)
    ]).then(([fightResult, itemResult]) => {
      if (!active) return
      if (fightResult.error) setError(fightResult.error.message)
      else setFights(fightResult.data as FightStat[])
      if (itemResult.error) setError(itemResult.error.message)
      else setItems(itemResult.data as ItemStat[])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [boss.id])

  const totalFights = fights.reduce((sum, fight) => sum + fight.total_fights, 0)
  const totalDrops = fights.reduce((sum, fight) => sum + fight.total_drops, 0)

  const sectionTitles = useMemo(() => {
    const titles = new Set<string>(['Inne'])
    for (const variant of boss.variants) {
      for (const section of variant.sections) titles.add(section.title)
    }
    return Array.from(titles).sort((a, b) => {
      const ai = CANONICAL.indexOf(a)
      const bi = CANONICAL.indexOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      if (a === 'Inne') return 1
      if (b === 'Inne') return -1
      return a.localeCompare(b)
    })
  }, [boss])

  function totalFor(variant: string): number {
    return fights.find((fight) => fight.variant === variant)?.total_fights ?? 0
  }

  function buildRows(variantLabel: string, sectionTitle: string): StatRow[] {
    const total = totalFor(variantLabel)
    const statMap = new Map(
      items.filter((item) => item.variant === variantLabel).map((item) => [item.item_name, item])
    )
    const wikiRows =
      boss.variants.find((variant) => variant.label === variantLabel)?.sections.find(
        (section) => section.title === sectionTitle
      )?.rows ?? []

    function mapRow(row: DropRow): StatRow {
      const stat = statMap.get(row.name)
      return {
        name: row.name,
        iconUrl: row.iconUrl,
        chance: stat && total > 0 ? (stat.fights_with_item / total) * 100 : undefined,
        fightsWithItem: stat?.fights_with_item ?? 0,
        times: stat?.times_dropped ?? 0,
        children: row.children.map(mapRow)
      }
    }

    function hasData(row: DropRow): boolean {
      return (
        (statMap.get(row.name)?.fights_with_item ?? 0) > 0 || row.children.some(hasData)
      )
    }

    const rows = sectionTitle === 'Inne' ? [] : wikiRows.filter(hasData).map(mapRow)

    if (sectionTitle === 'Inne') {
      const known = new Set(
        boss.variants.flatMap((variant) =>
          variant.sections.flatMap((section) =>
            section.rows.flatMap((row) => [row.name, ...row.children.map((child) => child.name)])
          )
        )
      )
      for (const [name, stat] of statMap) {
        if (known.has(name) || stat.fights_with_item === 0) continue
        rows.push({
          name,
          chance: total > 0 ? (stat.fights_with_item / total) * 100 : undefined,
          fightsWithItem: stat.fights_with_item,
          times: stat.times_dropped,
          children: []
        })
      }
    }

    return rows.sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0))
  }

  return (
    <section className="content">
      <header className="content-header">
        <div>
          <div className="content-kicker">Statystyka z realnych dropów</div>
          <h1>{boss.name}</h1>
          <p className="stats-subtitle">
            Szansa liczona jako: walki z przedmiotem / wszystkie walki. Nie z wiki.
          </p>
        </div>
        <div className="stats-totals">
          <div><strong>{totalFights}</strong> walk</div>
          <div><strong>{totalDrops}</strong> dropów</div>
        </div>
      </header>

      {error && <div className="log-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Ładowanie statystyk...</div>
      ) : totalFights === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◇</div>
          <h2>Brak zarejestrowanych walk</h2>
          <p>Zaloguj dropy w zakładce „Zapis dropu", a tutaj pojawi się tabela z realnymi szansami.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="drop-table real-stats-table">
            <thead>
              <tr>
                <th className="corner-cell" />
                {boss.variants.map((variant) => (
                  <th key={variant.id}>
                    {variant.label} <small>({totalFor(variant.label)} walk)</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectionTitles.map((title) => {
                const cells = boss.variants.map((variant) => ({
                  variant: variant.label,
                  rows: buildRows(variant.label, title)
                }))
                if (cells.every((cell) => cell.rows.length === 0)) return null
                return (
                  <tr key={title}>
                    <th className="section-title">{title}</th>
                    {cells.map((cell) => (
                      <td className="drop-cell" key={cell.variant}>
                        {cell.rows.length > 0 ? (
                          <ul className="drop-list">
                            {cell.rows.map((row, index) => (
                              <StatItem key={`${row.name}-${index}`} row={row} total={totalFor(cell.variant)} />
                            ))}
                          </ul>
                        ) : (
                          <span className="no-drops">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
