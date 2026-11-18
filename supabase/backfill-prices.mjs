import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

function normalizeItemName(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim()
}

const root = fileURLToPath(new URL('..', import.meta.url))
const env = Object.fromEntries(
  (await readFile(`${root}.env.local`, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    })
)

const anonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoeGhleGtwZXNhbnZlemFidXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5OTE3NzAsImV4cCI6MjExMDU2Nzc3MH0.FSfPt1fnHhFw7to14IxPlASwZkFjWoGfFA-b_3ig3cg'
const restUrl = `${env.SUPABASE_URL}/rest/v1/boss_drops?select=id,item_name,chaos_value,divine_value,price_league`
const response = await fetch(restUrl, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
})
if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
const rows = await response.json()

const missing = rows.filter((row) => row.chaos_value == null || row.divine_value == null)
console.log(`Wierszy: ${rows.length}, bez pełnej ceny: ${missing.length}`)
if (missing.length === 0) process.exit(0)

const prices = JSON.parse(await readFile(`${root}public/prices.json`, 'utf8'))
let updated = 0
let notFound = 0
const statements = []

for (const row of missing) {
  const price = prices.prices[normalizeItemName(row.item_name)]
  if (!price) {
    console.log(`  brak ceny dla: ${row.item_name}`)
    notFound++
    continue
  }
  const divine = price.divine == null ? 'NULL' : Number(price.divine)
  const league = String(prices.league).replace(/'/g, "''")
  statements.push(
    `update public.boss_drops set chaos_value = ${Number(price.chaos)}, divine_value = ${divine}, price_league = '${league}' where id = ${row.id};`
  )
  updated++
}

if (statements.length === 0) {
  console.log('Nie znaleziono cen dla żadnego z brakujących wpisów.')
  process.exit(0)
}

const sql = statements.join('\n')
const api = await fetch(
  `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  }
)
if (!api.ok) throw new Error(`SQL HTTP ${api.status}: ${await api.text()}`)
console.log(`Zaktualizowano ${updated} wpisów, bez ceny: ${notFound}.`)
