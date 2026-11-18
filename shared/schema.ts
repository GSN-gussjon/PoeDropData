import { z } from 'zod'

export type DropType = 'unique' | 'gem' | 'currency' | 'fragment' | 'other'

export interface DropRow {
  name: string
  chance: string | null
  type: DropType
  iconUrl?: string
  note?: string
  children: DropRow[]
}

export interface DropRowInput {
  name: string
  chance?: string | null
  type?: DropType
  iconUrl?: string
  note?: string
  children?: DropRowInput[]
}

export const dropRowSchema: z.ZodType<DropRow, z.ZodTypeDef, DropRowInput> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    chance: z.string().nullable().default(null),
    type: z.enum(['unique', 'gem', 'currency', 'fragment', 'other']).default('other'),
    iconUrl: z.string().optional(),
    note: z.string().optional(),
    children: z.array(dropRowSchema).default([])
  })
)

export const dropSectionSchema = z.object({
  title: z.string().min(1),
  rows: z.array(dropRowSchema).default([])
})

export const bossVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceUrl: z.string().url(),
  sections: z.array(dropSectionSchema).default([])
})

export const bossSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['Pinnacle', 'Uber', 'Ritual', 'Map', 'Delve', 'Other']).default('Other'),
  variants: z.array(bossVariantSchema).default([])
})

export const dropDataSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  source: z.object({
    name: z.string(),
    url: z.string().url(),
    license: z.string()
  }),
  bosses: z.array(bossSchema)
})

export const priceEntrySchema = z.object({
  chaos: z.number(),
  divine: z.number().nullable(),
  variant: z.string().nullable(),
  source: z.string()
})

export const priceDataSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  league: z.string(),
  source: z.object({ name: z.string(), url: z.string() }),
  prices: z.record(priceEntrySchema)
})

export type PriceData = z.infer<typeof priceDataSchema>
export type PriceEntry = z.infer<typeof priceEntrySchema>
export type DropSection = z.infer<typeof dropSectionSchema>
export type BossVariant = z.infer<typeof bossVariantSchema>
export type Boss = z.infer<typeof bossSchema>
export type DropData = z.infer<typeof dropDataSchema>
