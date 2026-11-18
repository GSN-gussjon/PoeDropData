import { useState } from 'react'
import type { Boss, DropRow, DropSection } from '../../../../shared/schema'

type Props = {
  boss: Boss
  onOpenSource: (url: string) => void
}

type TypeFilter = 'all' | 'unique' | 'gem' | 'currency' | 'other'

const FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unique', label: 'Unique' },
  { id: 'gem', label: 'Gems' },
  { id: 'currency', label: 'Currency' },
  { id: 'other', label: 'Other' }
]

function matches(row: DropRow, query: string, filter: TypeFilter): boolean {
  const nameMatch = row.name.toLowerCase().includes(query.toLowerCase())
  const typeMatch = filter === 'all' || row.type === filter
  const childMatch = row.children.some((child) => matches(child, query, filter))
  return (nameMatch && typeMatch) || childMatch
}

function Row({ row, depth }: { row: DropRow; depth: number }) {
  return (
    <li className={`drop-row depth-${Math.min(depth, 2)}`}>
      <span className="drop-row-main">
        {row.iconUrl && <img className="drop-icon" src={row.iconUrl} alt="" loading="lazy" />}
        <span className="drop-name">{row.name}</span>
        {row.chance && <span className="drop-chance">{row.chance}</span>}
        {row.note && <span className="drop-note">{row.note}</span>}
      </span>
      {row.children.length > 0 && (
        <ul className="drop-children">
          {row.children.map((child, index) => (
            <Row key={`${child.name}-${index}`} row={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function SectionCell({
  section,
  query,
  filter
}: {
  section: DropSection | undefined
  query: string
  filter: TypeFilter
}) {
  const rows = (section?.rows || []).filter((row) => matches(row, query, filter))
  return (
    <td className="drop-cell">
      {rows.length > 0 ? (
        <ul className="drop-list">
          {rows.map((row, index) => (
            <Row key={`${row.name}-${index}`} row={row} depth={0} />
          ))}
        </ul>
      ) : (
        <span className="no-drops">—</span>
      )}
    </td>
  )
}

export function DropTable({ boss, onOpenSource }: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [query, setQuery] = useState('')

  const canonicalOrder = ['Guaranteed Unique', 'Encounter-specific drops', 'Additional drops']
  const sectionTitles = Array.from(
    new Set(boss.variants.flatMap((variant) => variant.sections.map((section) => section.title)))
  ).sort((a, b) => {
    const ai = canonicalOrder.indexOf(a)
    const bi = canonicalOrder.indexOf(b)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })

  return (
    <section className="content">
      <header className="content-header">
        <div>
          <div className="content-kicker">{boss.category} boss</div>
          <h1>{boss.name}</h1>
        </div>
        {boss.variants[0]?.sourceUrl && (
          <button
            type="button"
            className="source-link"
            onClick={() => onOpenSource(boss.variants[0].sourceUrl)}
          >
            Otwórz na poewiki ↗
          </button>
        )}
      </header>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Filter drops..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter drops"
        />
        <div className="filter-chips">
          {FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={`chip ${typeFilter === filter.id ? 'active' : ''}`}
              onClick={() => setTypeFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {boss.variants.length === 0 || sectionTitles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◇</div>
          <h2>Brak danych o dropach</h2>
          <p>Uruchom scraper, aby pobrać tabelę z poewiki dla tego bossa.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="drop-table">
            <thead>
              <tr>
                <th className="corner-cell" />
                {boss.variants.map((variant) => (
                  <th key={variant.id}>{variant.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectionTitles.map((title) => (
                <tr key={title}>
                  <th className="section-title">{title}</th>
                  {boss.variants.map((variant) => (
                    <SectionCell
                      key={variant.id}
                      section={variant.sections.find((section) => section.title === title)}
                      query={query}
                      filter={typeFilter}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
