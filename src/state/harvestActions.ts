/**
 * Harvest entries (DESIGN.md §3.6). As elsewhere, each function turns an intent into events
 * and commits them; the page holds no state the log does not.
 */
import type { PayloadOf } from '@/model/schema'
import { newId } from '@/model/ids'
import { cropKey, unitFor } from '@/model/harvest'
import { sessionOf } from '@/engine/harvest'
import type { NewEvent } from '@/events/types'
import { today } from './actions'
import { ensureCurrentPerson } from './people'
import { useFarmStore } from './store'

function state() {
  return useFarmStore.getState().state
}

function commit(events: NewEvent[]) {
  return useFarmStore.getState().commit(events)
}

export interface HarvestInput {
  crop: string
  quantity: number
  date?: string
  varietyId?: string
  blockId?: string
  featureId?: string
  posKey?: string
  /** Defaults to the farm's unit for the crop. */
  unit?: string
  personIds?: string[]
  notes?: string
}

/**
 * File one box. The box number continues the day's session for that crop, the unit comes
 * from the farm unless given, and the picker defaults to whoever this device logs as.
 */
export function addHarvest(input: HarvestInput): string {
  const s = state()
  const crop = cropKey(input.crop)
  const date = input.date ?? today()
  const id = newId('hrv')
  const people = input.personIds ?? (ensureCurrentPerson() ? [ensureCurrentPerson()!.id] : [])
  commit([
    {
      type: 'harvest.create',
      payload: {
        id,
        date,
        crop,
        quantity: input.quantity,
        unit: input.unit ?? unitFor(s.farm, crop),
        box: sessionOf(s, date, crop).nextBox,
        ...(input.varietyId ? { varietyId: input.varietyId } : {}),
        ...(input.blockId ? { blockId: input.blockId } : {}),
        ...(input.featureId ? { featureId: input.featureId } : {}),
        ...(input.posKey ? { posKey: input.posKey } : {}),
        ...(people.length ? { personIds: people } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    },
  ])
  return id
}

export function updateHarvest(id: string, patch: Omit<PayloadOf<'harvest.patch'>, 'id'>): void {
  commit([{ type: 'harvest.patch', payload: { id, ...patch } }])
}

export function deleteHarvest(id: string): void {
  commit([{ type: 'harvest.delete', payload: { id } }])
}

/**
 * Set every unit a crop can be measured in, the usual one first. Entries already recorded
 * keep the unit they were entered with, and reports never add different units together, so
 * this is safe to change mid-season.
 */
export function setUnits(crop: string, list: string[]): void {
  const cleaned = [...new Set(list.map((u) => u.trim()).filter(Boolean))]
  if (cleaned.length === 0) return
  const units = { ...(state().farm?.units ?? {}), [cropKey(crop)]: cleaned }
  commit([{ type: 'farm.patch', payload: { units } }])
}
