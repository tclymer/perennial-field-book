/**
 * Writing chosen corrections back into a planner backup (DESIGN.md §6).
 *
 * The planner's import replaces the whole farm and its schema strips unknown keys, so this
 * edits the *raw parsed JSON* rather than anything validated: every key the planner cares
 * about survives untouched, including ones this app has never heard of. Each edit also
 * appends a sentence to the affected item's notes, because the planner has nowhere else to
 * record that a number came from measurement rather than an estimate.
 */
import type { Field, Row } from './compare'

export interface Change {
  plantingId: string
  field: Field
  value: number
  note: string
}

/** The rows a person ticked, as changes. */
export function changesFrom(
  plantingId: string,
  rows: Row[],
  chosen: ReadonlySet<string>,
): Change[] {
  return rows
    .filter((r) => chosen.has(`${plantingId}:${r.key}`) && r.measured !== undefined && !r.blocked)
    .map((r) => ({ plantingId, field: r.field, value: r.measured!, note: r.note }))
}

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Append a provenance line, keeping whatever was there. */
function addNote(existing: unknown, line: string): string {
  const prior = typeof existing === 'string' && existing.trim() ? `${existing.trim()}\n` : ''
  return `${prior}${line}`
}

export interface ApplyResult {
  json: string
  applied: number
  /** Changes that could not be placed, with why. */
  skipped: { change: Change; reason: string }[]
}

/**
 * Apply changes to a backup's raw JSON. `stamp` dates the provenance lines; the farm id and
 * schema version are never touched, so the planner restores it onto the same farm.
 */
export function applyChanges(raw: unknown, changes: Change[], stamp = new Date()): ApplyResult {
  const farm = structuredClone(raw) as Json
  const skipped: ApplyResult['skipped'] = []
  let applied = 0
  const plantings = Array.isArray(farm.plantings) ? (farm.plantings as Json[]) : []
  const on = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`

  for (const change of changes) {
    const p = plantings.find((x) => isObject(x) && x.id === change.plantingId)
    if (!p) {
      skipped.push({ change, reason: 'That planting is no longer in the file.' })
      continue
    }
    const line = `Field book ${on}: ${change.note}`
    switch (change.field.kind) {
      case 'plantedYear': {
        p.plantedYear = change.value
        p.notes = addNote(p.notes, line)
        applied += 1
        break
      }
      case 'yieldRealization': {
        const year = change.field.year
        const actuals = Array.isArray(p.actuals) ? (p.actuals as Json[]) : []
        const existing = actuals.find((a) => isObject(a) && a.year === year)
        if (existing) {
          existing.yieldRealization = change.value
          existing.note = addNote(existing.note, line)
        } else {
          actuals.push({ year, yieldRealization: change.value, note: line })
        }
        actuals.sort((a, b) => Number(a.year ?? 0) - Number(b.year ?? 0))
        p.actuals = actuals
        applied += 1
        break
      }
      case 'unitsPerHarvestHour': {
        if (!isObject(p.yield)) {
          skipped.push({ change, reason: 'That planting has no yield settings.' })
          break
        }
        p.yield.unitsPerHarvestHour = change.value
        p.notes = addNote(p.notes, line)
        applied += 1
        break
      }
      case 'costItem': {
        const id = change.field.itemId
        const lists = [p.costItems, p.harvestItems].filter(Array.isArray) as Json[][]
        const item = lists.flat().find((i) => isObject(i) && i.id === id)
        if (!item) {
          skipped.push({ change, reason: 'That cost item is no longer in the file.' })
          break
        }
        const was = item.quantity
        item.quantity = change.value
        item.notes = addNote(item.notes, `${line} Was ${typeof was === 'number' ? was : 'unset'}.`)
        applied += 1
        break
      }
    }
  }
  return { json: JSON.stringify(farm, null, 2), applied, skipped }
}

/** The name to save the edited backup under, next to the planner's own convention. */
export function fileNameFor(farmName: string | undefined, stamp = new Date()): string {
  const slug =
    (farmName ?? 'farm')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'farm'
  const date = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`
  return `${slug}-${date}-trued-up.json`
}
