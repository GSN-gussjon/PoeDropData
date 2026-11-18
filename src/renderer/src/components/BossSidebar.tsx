import type { Boss } from '../../../../shared/schema'

type Props = {
  bosses: Boss[]
  selectedId: string | null
  query: string
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
}

const CATEGORY_ORDER = ['Pinnacle', 'Uber', 'Ritual', 'Delve', 'Map', 'Other'] as const

export function BossSidebar({ bosses, selectedId, query, onQueryChange, onSelect }: Props) {
  const normalized = query.trim().toLowerCase()
  const filtered = bosses.filter((boss) => boss.name.toLowerCase().includes(normalized))

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <div>
          <div className="brand-title">PoE Boss Scrapper</div>
          <div className="brand-subtitle">Drop table reference</div>
        </div>
      </div>

      <div className="search-box">
        <input
          type="search"
          placeholder="Search boss..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search boss"
        />
      </div>

      <nav className="boss-list">
        {CATEGORY_ORDER.map((category) => {
          const group = filtered.filter((boss) => boss.category === category)
          if (group.length === 0) return null
          return (
            <div className="boss-group" key={category}>
              <div className="boss-group-title">{category}</div>
              {group.map((boss) => (
                <button
                  type="button"
                  key={boss.id}
                  className={`boss-item ${boss.id === selectedId ? 'active' : ''}`}
                  onClick={() => onSelect(boss.id)}
                >
                  <span className="boss-item-name">{boss.name}</span>
                  {boss.variants.length > 0 && (
                    <span className="boss-item-badge">{boss.variants.length}</span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
        {filtered.length === 0 && <div className="empty-hint">No bosses match “{query}”.</div>}
      </nav>
    </aside>
  )
}
