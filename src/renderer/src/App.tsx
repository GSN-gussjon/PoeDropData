import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  dropDataSchema,
  priceDataSchema,
  type Boss,
  type DropData,
  type PriceData
} from '../../../shared/schema'
import type { MechanicsData } from '../../../shared/mechanics'
import { BossSidebar } from './components/BossSidebar'
import { DropTable } from './components/DropTable'
import { DropLog } from './components/DropLog'
import { UsernamePrompt } from './components/UsernamePrompt'
import { RealStats } from './components/RealStats'
import { RankingBoard } from './components/RankingBoard'
import { BossRanking } from './components/BossRanking'
import { BossSimulator } from './components/BossSimulator'

const DATA_URL = `${import.meta.env.BASE_URL}drops.json`
const USERNAME_KEY = 'poe-boss-scrapper.username'
const RANKING_ID = '__ranking__'

type Tab = 'table' | 'log' | 'stats' | 'ranking'
type LoadResult = {
  data: DropData
  prices: PriceData | null
  mechanics: MechanicsData | null
  updatedAt: string
  error?: string
}

type FlatEntry = {
  id: string
  name: string
  category: Boss['category']
  displayBoss: Boss
}

function readUsername(): string | null {
  try {
    return window.localStorage.getItem(USERNAME_KEY)
  } catch {
    return null
  }
}

async function fetchDropData(): Promise<LoadResult> {
  const [response, pricesResponse, mechanicsResponse] = await Promise.all([
    fetch(DATA_URL, { cache: 'no-cache' }),
    fetch(`${import.meta.env.BASE_URL}prices.json`, { cache: 'no-cache' }),
    fetch(`${import.meta.env.BASE_URL}boss-mechanics.json`, { cache: 'no-cache' })
  ])
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const parsed = dropDataSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Nieprawidłowy format danych')

  let prices: PriceData | null = null
  if (pricesResponse.ok) {
    const parsedPrices = priceDataSchema.safeParse(await pricesResponse.json())
    if (parsedPrices.success) prices = parsedPrices.data
  }

  let mechanics: MechanicsData | null = null
  if (mechanicsResponse.ok) {
    const parsedMechanics = (await mechanicsResponse.json()) as MechanicsData
    if (parsedMechanics?.schemaVersion >= 1 && parsedMechanics.bosses) mechanics = parsedMechanics
  }

  return { data: parsed.data, prices, mechanics, updatedAt: parsed.data.generatedAt }
}

export default function App() {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bossQuery, setBossQuery] = useState('')
  const [tab, setTab] = useState<Tab>('table')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [username, setUsername] = useState<string | null>(readUsername)
  const [usernamePromptOpen, setUsernamePromptOpen] = useState(() => readUsername() === null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760)
  const [simulatorOpen, setSimulatorOpen] = useState(false)

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 760) setSidebarOpen(false)
  }

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true)
    try {
      const next = await fetchDropData()
      setResult(next)
    } catch (error) {
      setResult((current) =>
        current
          ? { ...current, error: error instanceof Error ? error.message : String(error) }
          : null
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  function saveUsername(name: string) {
    try {
      window.localStorage.setItem(USERNAME_KEY, name)
    } catch {
      // nazwa zostaje tylko na tę sesję
    }
    setUsername(name)
    setUsernamePromptOpen(false)
  }

  const data = result?.data ?? null

  // Każdy wariant staje się osobnym wpisem na liście bossów.
  const flatEntries = useMemo<FlatEntry[]>(() => {
    const bosses = data?.bosses ?? []
    const entries: FlatEntry[] = []
    for (const boss of bosses) {
      if (boss.variants.length === 0) {
        entries.push({ id: boss.id, name: boss.name, category: boss.category, displayBoss: boss })
        continue
      }
      for (const variant of boss.variants) {
        const name = boss.variants.length === 1 ? boss.name : variant.label
        entries.push({
          id: `${boss.id}:${variant.id}`,
          name,
          category: boss.category,
          displayBoss: { ...boss, name, variants: [variant] }
        })
      }
    }
    return entries
  }, [data])

  const rankingActive = selectedId === RANKING_ID
  const selectedEntry = rankingActive
    ? null
    : (flatEntries.find((entry) => entry.id === selectedId) ?? flatEntries[0] ?? null)
  const sidebarBosses = useMemo(
    () =>
      flatEntries.map((entry) => ({
        ...entry.displayBoss,
        id: entry.id,
        name: entry.name,
        category: entry.category,
        variants: []
      })),
    [flatEntries]
  )

  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <BossSidebar
        bosses={sidebarBosses}
        selectedId={rankingActive ? null : (selectedEntry?.id ?? null)}
        query={bossQuery}
        onQueryChange={setBossQuery}
        onSelect={(id) => {
          setSelectedId(id)
          closeSidebarOnMobile()
        }}
        rankingActive={rankingActive}
        onSelectRanking={() => {
          setSelectedId(RANKING_ID)
          closeSidebarOnMobile()
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main-area">
        {!sidebarOpen && (
          <div className="sidebar-toggle-bar">
            <button
              type="button"
              className="sidebar-fab"
              onClick={() => setSidebarOpen(true)}
              aria-label="Pokaż listę bossów"
            >
              ☰
            </button>
          </div>
        )}
        {!rankingActive && (
          <div className="tab-bar">
            <button
              type="button"
              className={tab === 'table' ? 'active' : ''}
              onClick={() => setTab('table')}
            >
              Drop table
            </button>
            <button type="button" className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
              Zapis dropu
            </button>
            <button type="button" className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
              Statystyka
            </button>
            <button type="button" className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}>
              Ranking
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-state">Ładowanie danych...</div>
        ) : rankingActive ? (
          <RankingBoard username={username ?? 'Anonim'} />
        ) : selectedEntry ? (
          tab === 'table' ? (
            <DropTable
              boss={selectedEntry.displayBoss}
              onOpenSource={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
              onSimulate={result?.mechanics?.bosses[selectedEntry.displayBoss.id] ? () => setSimulatorOpen(true) : undefined}
            />
          ) : tab === 'log' ? (
            <DropLog
              boss={selectedEntry.displayBoss}
              prices={result?.prices ?? null}
              username={username ?? 'Anonim'}
              onChangeUsername={() => setUsernamePromptOpen(true)}
            />
          ) : tab === 'ranking' ? (
            <BossRanking boss={selectedEntry.displayBoss} username={username ?? 'Anonim'} />
          ) : (
            <RealStats boss={selectedEntry.displayBoss} />
          )
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">◇</div>
            <h2>Nie udało się wczytać danych</h2>
            <p>Sprawdź, czy plik <code>drops.json</code> jest dostępny w katalogu aplikacji.</p>
          </div>
        )}

        <footer className="status-bar">
          <span>
            Dane: <strong>{data?.source.name ?? '—'}</strong> · {data?.source.license ?? ''}
          </span>
          <button
            type="button"
            className="refresh-button"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Odświeżanie…' : 'Odśwież dane'}
          </button>
          <span>{result ? `Pobrano: ${formatDate(result.updatedAt)}` : '—'}</span>
          {result?.error && (
            <span className="status-error" title={result.error}>
              Nie udało się odświeżyć
            </span>
          )}
        </footer>
      </main>

      {usernamePromptOpen && (
        <UsernamePrompt initial={username ?? undefined} onSave={saveUsername} />
      )}

      {simulatorOpen && result?.mechanics && selectedEntry && (
        <BossSimulator
          bossId={selectedEntry.displayBoss.id}
          boss={selectedEntry.displayBoss}
          mechanics={result.mechanics.bosses[selectedEntry.displayBoss.id]}
          onClose={() => setSimulatorOpen(false)}
        />
      )}
    </div>
  )
}
