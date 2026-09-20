/** Farm settings the planner comparison reads: tracking coverage and the cost item map. */
import type { Coverage } from '@/engine/compare'
import { useFarmStore } from './store'

function commit(events: Parameters<ReturnType<typeof useFarmStore.getState>['commit']>[0]) {
  return useFarmStore.getState().commit(events)
}

function farm() {
  return useFarmStore.getState().state.farm
}

/** How completely a category is recorded, which decides whether it may be trued up. */
export function setCoverage(category: string, level: Coverage): void {
  const coverage = { ...(farm()?.coverage ?? {}), [category]: level }
  commit([{ type: 'farm.patch', payload: { coverage } }])
}

/** Which field-book category feeds a planner cost item. An empty string means none. */
export function setCostItemCategory(plantingId: string, itemId: string, category: string): void {
  const map = farm()?.costItemMap ?? {}
  const forPlanting = { ...(map[plantingId] ?? {}), [itemId]: category }
  commit([{ type: 'farm.patch', payload: { costItemMap: { ...map, [plantingId]: forPlanting } } }])
}
