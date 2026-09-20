/**
 * Read-side helpers over FarmState, memoized per state object so the map and pages can
 * call them freely during a render.
 */
import type { FarmState, LngLat, Tree, Variety } from '@/model/types'
import { live } from '@/events/reduce'
import { allPositions, allSlots, type PositionInfo } from '@/engine/layout'
import { parsePosKey } from '@/model/ids'

function memo<T>(compute: (s: FarmState) => T): (s: FarmState) => T {
  const cache = new WeakMap<FarmState, T>()
  return (s) => {
    const hit = cache.get(s)
    if (hit !== undefined) return hit
    const v = compute(s)
    cache.set(s, v)
    return v
  }
}

/** Every position with its coordinate and label. */
export const positions = memo((s) => allPositions(s))

/** Every slot, taken-out ones included; the numbering skips those but records still name them. */
export const slots = memo((s) => allSlots(s))

/**
 * Position lookup by key, including slots the row no longer keeps. A harvest or a log
 * recorded before a tree was taken out still points at its key, and it should still be able
 * to say where it came from.
 */
export const positionByKey = memo((s) => {
  const m = new Map<string, PositionInfo>()
  for (const p of slots(s)) m.set(p.posKey, p)
  return m
})

/**
 * Position lookup by label, upper-cased. Taken-out slots are left out: their old number now
 * belongs to a different tree, so a search or a link must never land on them.
 */
export const positionByLabel = memo((s) => {
  const m = new Map<string, PositionInfo>()
  for (const p of positions(s)) m.set(p.label.toUpperCase(), p)
  return m
})

/** The tree currently at each position: the newest live one. */
export const currentTreeByPos = memo((s) => {
  const m = new Map<string, Tree>()
  for (const t of live.trees(s)) {
    const prev = m.get(t.posKey)
    if (!prev || t.createdAt > prev.createdAt) m.set(t.posKey, t)
  }
  return m
})

/** Every tree that has ever stood at a position, newest first. */
export function treesAt(s: FarmState, posKey: string): Tree[] {
  return live
    .trees(s)
    .filter((t) => t.posKey === posKey)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** The variety a position shows: the tree's own, else the row's default. */
export function varietyAt(s: FarmState, p: PositionInfo): Variety | undefined {
  const tree = currentTreeByPos(s).get(p.posKey)
  const id = tree?.varietyId ?? (p.rowId ? s.rows[p.rowId]?.defaultVarietyId : undefined)
  return id ? s.varieties[id] : undefined
}

export const PALETTE = [
  '#f97316',
  '#22d3ee',
  '#a3e635',
  '#f472b6',
  '#facc15',
  '#60a5fa',
  '#c084fc',
  '#34d399',
  '#fb7185',
  '#fbbf24',
  '#38bdf8',
  '#e879f9',
]

/** A stable color per variety: its own if set, else from the palette by name order. */
export const varietyColors = memo((s) => {
  const m = new Map<string, string>()
  const list = live.varieties(s).sort((a, b) => a.name.localeCompare(b.name))
  list.forEach((v, i) => m.set(v.id, v.color ?? PALETTE[i % PALETTE.length]))
  return m
})

export const varietiesByName = memo((s) =>
  live.varieties(s).sort((a, b) => a.name.localeCompare(b.name)),
)

/** Recorded trees per variety, by the tree's own variety. */
export const treeCountByVariety = memo((s) => {
  const m = new Map<string, number>()
  for (const t of currentTreeByPos(s).values()) {
    if (!t.varietyId) continue
    m.set(t.varietyId, (m.get(t.varietyId) ?? 0) + 1)
  }
  return m
})

/** Positions per variety as the map shows them: a tree's own variety, else its row's default. */
export const positionCountByVariety = memo((s) => {
  const m = new Map<string, number>()
  for (const p of positions(s)) {
    const v = varietyAt(s, p)
    if (v) m.set(v.id, (m.get(v.id) ?? 0) + 1)
  }
  return m
})

/** The species a block is mostly planted to: its own setting, else the commonest among its varieties. */
export function blockSpecies(s: FarmState, blockId: string): string | undefined {
  const block = s.blocks[blockId]
  if (block?.species) return block.species
  const tally = new Map<string, number>()
  for (const p of positions(s)) {
    if (p.blockId !== blockId) continue
    const v = varietyAt(s, p)
    if (v?.species) tally.set(v.species, (tally.get(v.species) ?? 0) + 1)
  }
  let best: string | undefined
  let n = 0
  for (const [sp, c] of tally) if (c > n) [best, n] = [sp, c]
  return best
}

export const blocksByCode = memo((s) => {
  const m = new Map<string, string>()
  for (const b of live.blocks(s)) m.set(b.code.toUpperCase(), b.id)
  return m
})

export function blockIdOfPosKey(s: FarmState, posKey: string): string | undefined {
  const parsed = parsePosKey(posKey)
  if ('rowId' in parsed) return s.rows[parsed.rowId]?.blockId
  return s.loosePositions[parsed.looseId]?.blockId
}

export function coordOfPosKey(s: FarmState, posKey: string): LngLat | undefined {
  return positionByKey(s).get(posKey)?.coord
}
