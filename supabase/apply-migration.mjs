import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const envRaw = await readFile(`${root}.env.local`, 'utf8')
const env = Object.fromEntries(
  envRaw.split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  })
)

const base = `${root}supabase/migrations`
const files = (await readdir(base)).filter((name) => name.endsWith('.sql')).sort()
const url = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`

async function query(sql) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`${response.status}: ${body}`)
  return body
}

for (const file of files) {
  const sql = await readFile(`${base}/${file}`, 'utf8')
  await query(sql)
  console.log(`Zaaplikowano: ${file}`)
}

const result = await query('select count(*)::int as count from public.boss_drops')
console.log('Wierszy w boss_drops:', JSON.parse(result)[0]?.count)
