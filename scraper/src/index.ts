import { chromium, type Page } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOSS_TARGETS, wikiUrl, type BossTarget } from './bosses'
import { buildBossFromTable, type ExtractedTable } from './parse'
import { dropDataSchema, type Boss, type DropData } from '../../shared/schema'

const OUTPUT = resolve(process.cwd(), 'public', 'drops.json')
const USER_AGENT =
  'PoEBossScrapper/0.1 (drop table viewer; non-commercial; contact: local-user)'
const EXTRACT_SCRIPT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'browser-extract.js')

async function waitForWiki(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const title = document.title || ''
      const body = document.body?.textContent || ''
      const isChallenge = /making sure you.?re not a bot|Anubis could not load/i.test(
        `${title} ${body}`
      )
      const hasContent =
        !!document.querySelector('#mw-content-text, .mw-parser-output') &&
        !!(document.querySelector('#mw-content-text, .mw-parser-output')?.textContent || '').trim()
      return !isChallenge && hasContent
    },
    undefined,
    { timeout: 180_000 }
  )
  // Anubis potrafi jeszcze chwilę dokładać treść po zniknięciu strony wyzwania.
  await page.waitForTimeout(1500)
}

async function scrapeBoss(
  page: Page,
  target: BossTarget,
  extractScript: string
): Promise<Boss | null> {
  const url = wikiUrl(target.slug)
  process.stdout.write(`  → ${target.name} (${url}) ... `)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await waitForWiki(page)
    const extracted = (await page.evaluate(extractScript)) as ExtractedTable | null
    if (!extracted) {
      process.stdout.write('brak tabeli dropów\n')
      return null
    }
    const boss = buildBossFromTable(target, extracted, url)
    process.stdout.write(`${boss.variants.length} wariant(ów), ${boss.variants.reduce((n, v) => n + v.sections.reduce((m, s) => m + s.rows.length, 0), 0)} wpisów\n`)
    return boss
  } catch (error) {
    process.stdout.write(`błąd: ${error instanceof Error ? error.message : String(error)}\n`)
    return null
  }
}

async function readPrevious(): Promise<DropData | null> {
  try {
    const raw = await readFile(OUTPUT, 'utf8')
    const parsed = dropDataSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const bossArgIndex = process.argv.indexOf('--boss')
  const onlyBoss = bossArgIndex >= 0 ? process.argv[bossArgIndex + 1] : undefined
  const targets = onlyBoss ? BOSS_TARGETS.filter((b) => b.id === onlyBoss) : BOSS_TARGETS

  if (targets.length === 0) {
    throw new Error(`Nieznany boss: ${onlyBoss}`)
  }

  const previous = await readPrevious()
  const extractScript = await readFile(EXTRACT_SCRIPT, 'utf8')
  const browser = await chromium.launch({
    headless: process.env['HEADLESS'] !== 'false',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ]
  })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'en-US',
    viewport: { width: 1440, height: 900 }
  })
  const page = await context.newPage()

  let updated = 0
  try {
    for (const target of targets) {
      const boss = await scrapeBoss(page, target, extractScript)
      if (boss && boss.variants.some((v) => v.sections.length > 0)) {
        const index = previous?.bosses.findIndex((b) => b.id === boss.id) ?? -1
        if (index >= 0 && previous) previous.bosses[index] = boss
        else previous?.bosses.push(boss)
        updated++
      }
    }
  } finally {
    await browser.close()
  }

  const data: DropData = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: 'poewiki.net',
      url: 'https://www.poewiki.net/',
      license: 'CC BY-NC-SA 3.0'
    },
    bosses: previous?.bosses ?? []
  }

  const validated = dropDataSchema.parse(data)
  await mkdir(resolve(process.cwd(), 'public'), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
  process.stdout.write(`\nZapisano ${OUTPUT} (zaktualizowano ${updated} bossów).\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
