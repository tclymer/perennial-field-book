/**
 * Reads a Perennial Profit Planner backup and proposes one block per planting. Only the
 * fields the field book needs are validated; everything else in the file is ignored.
 */
import { z } from 'zod'
import type { PlannerLink } from '@/model/types'
import { CODE_RE, normalizeCode } from '@/model/ids'

const planting = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(['active', 'prospective', 'removed']).optional(),
    plantedYear: z.number().int().optional(),
    geometry: z
      .object({
        rowLengthFt: z.number().nonnegative().optional(),
        rowWidthFt: z.number().nonnegative().optional(),
        inRowSpacingFt: z.number().nonnegative().optional(),
        rows: z.number().nonnegative().optional(),
      })
      .partial()
      .optional(),
    yield: z.object({ unit: z.string().optional() }).partial().optional(),
    templateId: z.string().optional(),
  })
  .loose()

export const plannerBackup = z
  .object({
    name: z.string().optional(),
    plantings: z.array(planting).max(1000),
  })
  .loose()

export type PlannerPlanting = z.infer<typeof planting>

export interface BlockProposal {
  plantingId: string
  name: string
  code: string
  status: 'active' | 'prospective' | 'removed'
  species?: string
  rowSpacingFt?: number
  inRowSpacingFt?: number
  planner: PlannerLink
}

/** Throws a readable message when the text is not a planner backup. */
export function parsePlannerBackup(text: string): { name?: string; plantings: PlannerPlanting[] } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const result = plannerBackup.safeParse(raw)
  if (!result.success) throw new Error('That file is not a Perennial Profit Planner backup.')
  return { name: result.data.name, plantings: result.data.plantings }
}

/** "Pawpaws - Block 1" → PB1, "Kiwi Berries" → KB. Letters of each word plus any digits. */
export function suggestCode(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  let code = ''
  for (const w of words) code += /^\d+$/.test(w) ? w : w[0]
  code = normalizeCode(code).slice(0, 8)
  return CODE_RE.test(code) ? code : 'BLK'
}

/** The species a template id starts with: "pawpaw-..." → "pawpaw". */
export function speciesFromTemplate(templateId?: string): string | undefined {
  if (!templateId) return undefined
  const head = templateId.split(/[-_]/)[0]
  return head ? head.replace(/s$/, '') : undefined
}

/** One proposal per planting, with codes made unique against those already in use. */
export function proposeBlocks(
  plantings: PlannerPlanting[],
  takenCodes: Iterable<string> = [],
): BlockProposal[] {
  const taken = new Set([...takenCodes].map(normalizeCode))
  return plantings.map((p) => {
    let code = suggestCode(p.name)
    let n = 2
    const base = code.slice(0, 7)
    while (taken.has(code)) code = `${base}${n++}`
    taken.add(code)
    const g = p.geometry ?? {}
    return {
      plantingId: p.id,
      name: p.name,
      code,
      status: p.status ?? 'active',
      species: speciesFromTemplate(p.templateId),
      ...(g.rowWidthFt ? { rowSpacingFt: g.rowWidthFt } : {}),
      ...(g.inRowSpacingFt ? { inRowSpacingFt: g.inRowSpacingFt } : {}),
      planner: {
        plantingId: p.id,
        name: p.name,
        ...(g.rowLengthFt ? { rowLengthFt: g.rowLengthFt } : {}),
        ...(g.rowWidthFt ? { rowWidthFt: g.rowWidthFt } : {}),
        ...(g.inRowSpacingFt ? { inRowSpacingFt: g.inRowSpacingFt } : {}),
        ...(g.rows ? { rows: g.rows } : {}),
        ...(p.yield?.unit ? { unit: p.yield.unit } : {}),
        ...(p.plantedYear ? { plantedYear: p.plantedYear } : {}),
      },
    }
  })
}
