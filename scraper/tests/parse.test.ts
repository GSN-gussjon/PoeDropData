import { describe, expect, it } from 'vitest'
import { buildBossFromTable, type ExtractedTable } from '../src/parse'
import { dropDataSchema } from '../../shared/schema'
import seed from '../../public/drops.json'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sample: ExtractedTable = {
  score: 20,
  variants: ['Maven', 'Uber Maven'],
  sections: [
    {
      title: 'Guaranteed Unique',
      cells: [
        [
          { name: 'Legacy of Fury', chance: '41%', note: null, href: 'https://www.poewiki.net/wiki/Legacy_of_Fury', iconUrl: null, raw: 'Legacy of Fury (41%)', children: [] }
        ],
        [
          { name: "Viridi's Veil", chance: '52%', note: null, href: 'https://www.poewiki.net/wiki/Viridi%27s_Veil', iconUrl: null, raw: "Viridi's Veil (52%)", children: [] }
        ]
      ]
    },
    {
      title: 'Additional drops',
      cells: [
        [
          { name: 'Orb of Conflict', chance: '32%', note: null, href: null, iconUrl: null, raw: 'Orb of Conflict (32%)', children: [] }
        ],
        []
      ]
    }
  ]
}

describe('buildBossFromTable', () => {
  it('maps variants, sections and rows', () => {
    const boss = buildBossFromTable(
      { id: 'the-maven', name: 'The Maven', category: 'Pinnacle', slug: 'The_Maven' },
      sample,
      'https://www.poewiki.net/wiki/The_Maven'
    )

    expect(boss.variants).toHaveLength(2)
    expect(boss.variants[0].label).toBe('Maven')
    expect(boss.variants[0].sections[0].rows[0].chance).toBe('41%')
    expect(boss.variants[1].sections[0].rows[0].name).toBe("Viridi's Veil")
    expect(boss.variants[1].sections.some((section) => section.title === 'Additional drops')).toBe(false)
  })

  it('infers drop type from the item name', () => {
    const boss = buildBossFromTable(
      { id: 'the-maven', name: 'The Maven', category: 'Pinnacle', slug: 'The_Maven' },
      sample,
      'https://www.poewiki.net/wiki/The_Maven'
    )
    expect(boss.variants[0].sections[0].rows[0].type).toBe('unique')
    expect(boss.variants[0].sections[1].rows[0].type).toBe('currency')
  })
})

describe('seed data', () => {
  it('matches the schema', async () => {
    const raw = await readFile(resolve(process.cwd(), 'public', 'drops.json'), 'utf8')
    expect(dropDataSchema.safeParse(JSON.parse(raw)).success).toBe(true)
  })

  it('has Maven unique chances summing to 100% in both variants', () => {
    const maven = dropDataSchema.parse(seed).bosses.find((boss) => boss.id === 'the-maven')
    expect(maven).toBeDefined()
    for (const variant of maven!.variants) {
      const section = variant.sections.find(
        (section) => section.title.replace(/\s/g, '').toLowerCase() === 'guaranteedunique'
      )
      const values = (section?.rows || [])
        .map((row) => Number.parseFloat(row.chance || ''))
        .filter((value) => Number.isFinite(value))
      expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 5)
    }
  })
})
