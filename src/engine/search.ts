/** One search box over trees, rows, blocks, varieties, and features. */
import type { FarmState } from '@/model/types'
import { live } from '@/events/reduce'
import { parseTreeLabel } from '@/model/ids'
import { currentTreeByPos, positions, varietyAt } from '@/state/derived'

export interface SearchHit {
  kind: 'tree' | 'row' | 'block' | 'variety' | 'feature' | 'task'
  title: string
  detail?: string
  /** Hash route to open. */
  to: string
}

export interface SearchResult {
  /** Set when the query is exactly a tree label that exists. */
  exact?: SearchHit
  hits: SearchHit[]
}

const LIMIT = 60

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export function search(state: FarmState, query: string): SearchResult {
  const q = norm(query)
  if (!q) return { hits: [] }
  const hits: SearchHit[] = []
  let exact: SearchHit | undefined
  const trees = currentTreeByPos(state)

  // Exact tree label.
  const parsed = parseTreeLabel(query)
  if (parsed) {
    const p = positions(state).find((p) => p.label.toLowerCase() === q)
    if (p) {
      const v = varietyAt(state, p)
      exact = {
        kind: 'tree',
        title: p.label,
        detail: v?.name ?? (trees.has(p.posKey) ? 'variety unknown' : 'empty'),
        to: `/t/${encodeURIComponent(p.label)}`,
      }
    }
  }

  for (const b of live.blocks(state)) {
    if (norm(b.code).includes(q) || norm(b.name).includes(q)) {
      hits.push({ kind: 'block', title: `${b.code} · ${b.name}`, to: `/blocks/${b.id}/grid` })
    }
  }
  for (const v of live.varieties(state)) {
    const names = [v.name, ...(v.aliases ?? [])].map(norm)
    if (names.some((n) => n.includes(q)) || norm(v.species).includes(q)) {
      hits.push({ kind: 'variety', title: v.name, detail: v.species, to: '/varieties' })
    }
  }
  for (const f of live.features(state)) {
    if (norm(f.name).includes(q) || norm(f.kind).includes(q)) {
      hits.push({ kind: 'feature', title: f.name, detail: f.kind, to: '/' })
    }
  }

  for (const t of live.tasks(state)) {
    if (norm(t.title).includes(q) || (t.notes && norm(t.notes).includes(q))) {
      hits.push({
        kind: 'task',
        title: t.title,
        detail: t.done ? 'done' : undefined,
        to: `/tasks/${t.id}`,
      })
    }
  }

  // Rows: by label like "PP1-3", by default variety, or by block.
  const byLabel = new Map<string, { block: string; rowId: string; varietyName?: string }>()
  for (const r of live.rows(state)) {
    const block = state.blocks[r.blockId]
    if (!block) continue
    const label = `${block.code}-${r.number}`
    const dv = r.defaultVarietyId ? state.varieties[r.defaultVarietyId] : undefined
    if (norm(label) === q || norm(label).startsWith(q) || (dv && norm(dv.name).includes(q))) {
      byLabel.set(label, { block: block.name, rowId: r.id, varietyName: dv?.name })
    }
  }
  for (const [label, info] of byLabel) {
    const blockId = state.rows[info.rowId].blockId
    hits.push({
      kind: 'row',
      title: label,
      detail: [info.block, info.varietyName].filter(Boolean).join(' · '),
      to: `/blocks/${blockId}/grid`,
    })
  }

  // Trees: label prefix or variety name, grouped by block.
  let count = 0
  for (const p of positions(state)) {
    if (count >= LIMIT) break
    const tree = trees.get(p.posKey)
    const v = varietyAt(state, p)
    const matchLabel = p.label.toLowerCase().startsWith(q)
    const matchVariety = v ? norm(v.name).includes(q) : false
    if (!matchLabel && !matchVariety) continue
    if (exact && exact.title === p.label) continue
    const block = state.blocks[p.blockId]
    hits.push({
      kind: 'tree',
      title: p.label,
      detail: [v?.name ?? (tree ? 'variety unknown' : 'empty'), block?.name, tree?.status]
        .filter(Boolean)
        .join(' · '),
      to: `/t/${encodeURIComponent(p.label)}`,
    })
    count += 1
  }

  return { exact, hits }
}
