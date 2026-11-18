import type { Boss, BossVariant, DropRow, DropSection } from '../../shared/schema'
import type { BossTarget } from './bosses'

export type ExtractedItem = {
  name: string
  chance: string | null
  note: string | null
  href: string | null
  iconUrl: string | null
  raw: string
  junk?: boolean
  children: ExtractedItem[]
}

export type ExtractedTable = {
  variants: string[]
  sections: { title: string; cells: ExtractedItem[][] }[]
  score: number
}

/** Kod wykonywany w przeglądarce znajduje się w `browser-extract.js`. */

function inferType(item: ExtractedItem): DropRow['type'] {
  const haystack = `${item.name} ${item.href || ''}`.toLowerCase()
  if (/support|awakened|gem/.test(haystack)) return 'gem'
  if (/orb|currency|divine|exalted|chaos|scarab|fossil|essence|key|fragment|stone|invitation|curio|reliquary|relic/.test(haystack)) return 'currency'
  if (/unique|of the|legacy|veil|progenesis|grace|escape|anguish|delight|secret|fury|echoforge|guise/.test(haystack)) return 'unique'
  return 'other'
}

function toRow(item: ExtractedItem, sectionTitle = ''): DropRow {
  let inferred = inferType(item)
  if (inferred === 'other' && /item drops?/i.test(sectionTitle)) inferred = 'unique'
  const row: DropRow = {
    name: item.name,
    chance: item.chance,
    type: inferred === 'other' && /unique/i.test(sectionTitle) ? 'unique' : inferred,
    children: item.children.map((child) => toRow(child, sectionTitle))
  }
  if (item.iconUrl) row.iconUrl = item.iconUrl
  if (item.note) row.note = item.note
  else if (item.raw && item.raw !== item.name && !item.chance) row.note = item.raw
  return row
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'variant'
  )
}

export function buildBossFromTable(
  target: BossTarget,
  extracted: ExtractedTable,
  sourceUrl: string
): Boss {
  const variants: BossVariant[] = extracted.variants.map((label, index) => {
    const sections: DropSection[] = extracted.sections
      .map((section) => ({
        title: section.title,
        rows: (section.cells[index] || []).map((item) => toRow(item, section.title))
      }))
      .filter((section) => section.rows.length > 0)

    return {
      id: slugify(label),
      label,
      sourceUrl,
      sections
    }
  })

  return {
    id: target.id,
    name: target.name,
    category: target.category,
    variants
  }
}
