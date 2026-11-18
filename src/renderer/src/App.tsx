import { useCallback, useEffect, useState } from 'react'
import { dropDataSchema, type DropData } from '../../../shared/schema'
import { BossSidebar } from './components/BossSidebar'
import { DropTable } from './components/DropTable'
import { DropLog } from './components/DropLog'
import { UsernamePrompt } from './components/UsernamePrompt'
import { RealStats } from './components/RealStats'

const DATA_URL = `${import.meta.env.BASE_URL}drops.json`
const USERNAME_KEY = 'poe-boss-scrapper.username'

type Tab = 'table' | 'log' | 'stats'
type LoadResult = {
  data: DropData
  updatedAt: string
  error?: string
}

function readUsername(): string | null {
  try {
    return window.localStorage.getItem(USERNAME_KEY)
  } catch {
    return null
  }
}

async function fetchDropData(): Promise<LoadResult> {
  const response = await fetch(DATA_URL, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const parsed = dropDataSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Nieprawidłowy format danych')
  return { data: parsed.data, updatedAt: parsed.data.generatedAt }
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

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true)
    try {
      const next = await fetchDropData()
      setResult(next)
      setSelectedId((current) => current ?? next.data.bosses[0]?.id ?? null)
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
      // brak dostępu do pamięci lokalnej — nazwa zostanie tylko na THIS session
    }
    setUsername(name)
    setUsernamePromptOpen(false)
  }

  const data = result?.data ?? null
  const selectedBoss = data?.bosses.find((boss) => boss.id === selectedId) ?? data?.bosses[0] ?? null

  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }

  return (
    <div className="app-shell">
      <BossSidebar
        bosses={data?.bosses ?? []}
        selectedId={selectedBoss?.id ?? null}
        query={bossQuery}
        onQueryChange={setBossQuery}
        onSelect={setSelectedId}
      />
      <main className="main-area">
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
        </div>

        {loading ? (
          <div className="loading-state">Ładowanie danych...</div>
        ) : selectedBoss ? (
          tab === 'table' ? (
            <DropTable
              boss={selectedBoss}
              onOpenSource={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
            />
          ) : tab === 'log' ? (
            <DropLog
              boss={selectedBoss}
              username={username ?? 'Anonim'}
              onChangeUsername={() => setUsernamePromptOpen(true)}
            />
          ) : (
            <RealStats boss={selectedBoss} />
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
    </div>
  )
}
