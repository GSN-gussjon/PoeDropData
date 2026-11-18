export type BossTarget = {
  id: string
  name: string
  category: 'Pinnacle' | 'Uber' | 'Ritual' | 'Map' | 'Delve' | 'Other'
  slug: string
  /** Labeli wariantów pobrane z nagłówków tabeli na wiki — używane tylko do walidacji. */
  expectedVariants?: string[]
}

export const BOSS_TARGETS: BossTarget[] = [
  {
    id: 'the-maven',
    name: 'The Maven',
    category: 'Pinnacle',
    slug: 'The_Maven',
    expectedVariants: ['Maven', 'Uber Maven']
  },
  {
    id: 'the-shaper',
    name: 'The Shaper',
    category: 'Pinnacle',
    slug: 'The_Shaper'
  },
  {
    id: 'the-elder',
    name: 'The Elder',
    category: 'Pinnacle',
    slug: 'The_Elder'
  },
  {
    id: 'sirus',
    name: 'Sirus, Awakener of Worlds',
    category: 'Pinnacle',
    slug: 'Sirus,_Awakener_of_Worlds'
  },
  {
    id: 'the-searing-exarch',
    name: 'The Searing Exarch',
    category: 'Pinnacle',
    slug: 'The_Searing_Exarch'
  },
  {
    id: 'the-eater-of-worlds',
    name: 'The Eater of Worlds',
    category: 'Pinnacle',
    slug: 'The_Eater_of_Worlds'
  },
  {
    id: 'atziri',
    name: 'Atziri',
    category: 'Pinnacle',
    slug: 'Atziri'
  },
  {
    id: 'uber-elder',
    name: 'Uber Elder',
    category: 'Pinnacle',
    slug: 'Uber_Elder',
    expectedVariants: ['Uber Elder', 'Uber Uber Elder']
  },
  {
    id: 'aul',
    name: 'Aul, the Crystal King',
    category: 'Delve',
    slug: 'Aul,_the_Crystal_King'
  },
  {
    id: 'kurgal',
    name: 'Kurgal, the Blackblooded',
    category: 'Delve',
    slug: 'Kurgal,_the_Blackblooded'
  },
  {
    id: 'ahuatotli',
    name: 'Ahuatotli, the Blind',
    category: 'Delve',
    slug: 'Ahuatotli,_the_Blind'
  },
  {
    id: 'the-king-in-the-mists',
    name: 'The King in the Mists',
    category: 'Ritual',
    slug: 'The_King_in_the_Mists'
  },
  {
    id: 'incarnation-of-dread',
    name: 'Incarnation of Dread',
    category: 'Pinnacle',
    slug: 'Incarnation_of_Dread'
  },
  {
    id: 'incarnation-of-neglect',
    name: 'Incarnation of Neglect',
    category: 'Pinnacle',
    slug: 'Incarnation_of_Neglect'
  },
  {
    id: 'incarnation-of-fear',
    name: 'Incarnation of Fear',
    category: 'Pinnacle',
    slug: 'Incarnation_of_Fear'
  },
  {
    id: 'venarius',
    name: 'Venarius (Cortex)',
    category: 'Pinnacle',
    slug: 'Venarius'
  }
]

export const WIKI_BASE = 'https://www.poewiki.net/wiki/'

export function wikiUrl(slug: string): string {
  return `${WIKI_BASE}${slug}`
}
