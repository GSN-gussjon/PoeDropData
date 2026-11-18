import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { dropDataSchema } from '../../shared/schema'
import { normalizeItemName as normalize } from '../../shared/normalize'

const NINJA = 'https://poe.ninja/poe1/api/economy'
const USER_AGENT = 'PoEBossScrapper/0.1 (non-commercial drop table viewer)'

const ITEM_TYPES = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueJewel',
  'UniqueFlask',
  'UniqueRelic',
  'SkillGem'
]
const CURRENCY_TYPES = ['Currency', 'Fragment']
const EXCHANGE_TYPES = ['Currency', 'Fragment']

type PriceEntry = {
  chaos: number
  divine: number | null
  variant: string | null
  source: string
}

type NinjaLine = {
  name?: string
  currencyTypeName?: string
  chaosValue?: number
  divineValue?: number
  chaosEquivalent?: number
  corrupted?: boolean
  variant?: string
  count?: number
  listingCount?: number
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} dla ${url}`)
  return (await response.json()) as T
}

function preferredLine(lines: NinjaLine[]): NinjaLine | null {
  const priced = lines.filter(
    (line) => (line.chaosValue ?? line.chaosEquivalent ?? 0) > 0
  )
  if (priced.length === 0) return null

  // Preferuj wariant „unidentified"/niez corrupted, jeśli poe.ninja go podaje.
  const clean = priced.filter(
    (line) => line.corrupted === false || /unident/i.test(line.variant ?? '')
  )
  const pool = clean.length > 0 ? clean : priced
  return [...pool].sort(
    (a, b) => (b.count ?? b.listingCount ?? 0) - (a.count ?? a.listingCount ?? 0)
  )[0]
}

export async function refreshPrices(dropDataPath: string, outputPath: string): Promise<void> {
  const raw = await readFile(dropDataPath, 'utf8')
  const data = dropDataSchema.parse(JSON.parse(raw))
  const wanted = new Set<string>()
  for (const boss of data.bosses) {
    for (const variant of boss.variants) {
      for (const section of variant.sections) {
        for (const row of section.rows) {
          for (const item of [row, ...row.children]) wanted.add(normalize(item.name))
        }
      }
    }
  }

  const leaguesResponse = await fetch(`${NINJA}/leagues`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000)
  })
  if (!leaguesResponse.ok) throw new Error(`HTTP ${leaguesResponse.status} dla leagues`)
  const leagues = (await leaguesResponse.json()) as { id: string }[]
  const league = leagues[0]?.id
  if (!league) throw new Error('Brak aktywnej ligi w API poe.ninja')
  process.stdout.write(`  Liga poe.ninja: ${league}\n`)

  const prices: Record<string, PriceEntry> = {}

  for (const type of ITEM_TYPES) {
    const url = `${NINJA}/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`
    const { lines = [] } = await getJson<{ lines?: NinjaLine[] }>(url)
    const grouped = new Map<string, NinjaLine[]>()
    for (const line of lines) {
      if (!line.name) continue
      const key = normalize(line.name)
      if (!wanted.has(key)) continue
      const group = grouped.get(key) ?? []
      group.push(line)
      grouped.set(key, group)
    }
    for (const [key, group] of grouped) {
      if (prices[key]) continue
      const line = preferredLine(group)
      if (!line) continue
      prices[key] = {
        chaos: line.chaosValue!,
        divine: line.divineValue ?? null,
        variant: line.variant ?? null,
        source: type
      }
    }
    process.stdout.write(`  ${type}: ${grouped.size} pasujących\n`)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  for (const type of CURRENCY_TYPES) {
    const url = `${NINJA}/stash/current/currency/overview?league=${encodeURIComponent(league)}&type=${type}`
    const { lines = [] } = await getJson<{ lines?: NinjaLine[] }>(url)
    for (const line of lines) {
      const name = line.currencyTypeName
      if (!name) continue
      const key = normalize(name)
      if (!wanted.has(key) || prices[key]) continue
      const value = line.chaosEquivalent ?? 0
      if (value <= 0) continue
      prices[key] = { chaos: value, divine: null, variant: null, source: type }
    }
    process.stdout.write(`  ${type}: sprawdzone\n`)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  for (const type of EXCHANGE_TYPES) {
    const url = `${NINJA}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`
    const result = await getJson<{
      lines?: { id: string; primaryValue: number }[]
      items?: { id: string; name: string }[]
      core?: { primary?: string }
    }>(url)
    const names = new Map((result.items ?? []).map((item) => [item.id, item.name]))
    for (const line of result.lines ?? []) {
      const name = names.get(line.id)
      if (!name) continue
      const key = normalize(name)
      if (!wanted.has(key) || prices[key]) continue
      const value = line.primaryValue ?? 0
      if (value <= 0) continue
      prices[key] = { chaos: value, divine: null, variant: null, source: `exchange:${type}` }
    }
    process.stdout.write(`  exchange:${type}: sprawdzone\n`)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    league,
    source: { name: 'poe.ninja', url: 'https://poe.ninja/' },
    prices
  }
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  process.stdout.write(`Zapisano ${outputPath} (${Object.keys(prices).length} cen).\n`)
}
